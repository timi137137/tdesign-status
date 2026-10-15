import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../server/app';
import { loadConfig } from '../../server/config';
import { openDatabase } from '../../server/db/client';
import { applyMigrations } from '../../server/db/migrate';
import { serviceProbes } from '../../server/db/schema';
import { seedFreshDatabase } from '../../server/db/seed';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'verify-pass-12345';
/** 写操作必须带 Origin，取值与 host 同源，才能通过 CSRF 校验。 */
const HOST = 'status.test';
const ORIGIN = `http://${HOST}`;

let app: FastifyInstance;
let cookie: string;
let dir: string;

interface InjectInput {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
}

const request = (input: InjectInput) =>
  app.inject({
    method: input.method,
    url: input.url,
    headers: {
      host: HOST,
      origin: ORIGIN,
      ...(input.cookie === null ? {} : { cookie: input.cookie ?? cookie }),
      ...input.headers,
    },
    ...(input.payload === undefined ? {} : { payload: input.payload as object }),
  });

interface ProbeBody {
  serviceId: string;
  name: string;
  type: string;
  target: string;
  config?: unknown;
  intervalSeconds?: number;
  enabled?: boolean;
}

const validBody: ProbeBody = {
  serviceId: 'wechat',
  name: '北京 HTTP',
  type: 'http',
  target: 'https://example.com/health',
};

const createProbe = (payload: ProbeBody, overrides: Partial<InjectInput> = {}) =>
  request({ method: 'POST', url: '/api/admin/probes', payload, ...overrides });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'status-admin-probes-'));
  process.env.NODE_ENV = 'test';
  process.env.STATUS_DB_PATH = join(dir, 'status.db');
  process.env.STATUS_ADMIN_USERNAME = ADMIN_USERNAME;
  process.env.STATUS_ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.STATUS_ADMIN_MUST_CHANGE = 'false';
  process.env.STATUS_AUTO_SEED = 'false';
  process.env.STATUS_TRUST_PROXY = 'false';
  process.env.STATUS_LOGIN_RATE_LIMIT = '100';

  const config = loadConfig();
  const context = openDatabase(config);
  try {
    applyMigrations(context, config.migrationsPath);
    await seedFreshDatabase(context);
  } finally {
    context.close();
  }

  app = await buildApp(loadConfig());
  const login = await request({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    cookie: null,
  });
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers['set-cookie']).split(';')[0];
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.STATUS_ADMIN_MUST_CHANGE;
});

describe('监控点位接口', () => {
  it('未登录时拒绝访问', async () => {
    const response = await request({ method: 'GET', url: '/api/admin/probes', cookie: null });
    expect(response.statusCode).toBe(401);
  });

  it('返回探针类型目录，字段描述供后台渲染表单', async () => {
    const response = await request({ method: 'GET', url: '/api/admin/probe-types' });
    expect(response.statusCode).toBe(200);
    const items = response.json().data.items as Array<{ name: string; label: string; fields: unknown[] }>;
    expect(items.map((item) => item.name)).toEqual(['http', 'tcp']);
    const http = items.find((item) => item.name === 'http');
    expect(http?.label).toBeTruthy();
    expect(http?.fields.length).toBeGreaterThan(0);
  });

  it('创建时校验服务、类型、目标与参数', async () => {
    const missingService = await createProbe({ ...validBody, serviceId: 'nope' });
    expect(missingService.statusCode).toBe(404);

    const unknownType = await createProbe({ ...validBody, type: 'nope' });
    expect(unknownType.statusCode).toBe(400);
    expect(unknownType.json().message).toContain('未知的探针类型');

    const badTarget = await createProbe({ ...validBody, target: 'example.com/health' });
    expect(badTarget.statusCode).toBe(400);
    expect(badTarget.json().message).toContain('绝对 URL');

    const unknownField = await createProbe({ ...validBody, config: { methodd: 'GET' } });
    expect(unknownField.statusCode).toBe(400);
    expect(unknownField.json().message).toContain('未知字段');

    const outOfRange = await createProbe({ ...validBody, intervalSeconds: 5 });
    expect(outOfRange.statusCode).toBe(400);
  });

  it('创建后出现在列表里，参数补上默认值', async () => {
    const created = await createProbe(validBody);
    expect(created.statusCode).toBe(201);
    const row = created.json().data as Record<string, unknown>;
    expect(row).toMatchObject({ type: 'http', target: 'https://example.com/health', enabled: true });
    expect(row.intervalSeconds).toBe(60);
    expect(row.configJson).toMatchObject({ method: 'GET', expectedStatusFrom: 200, followRedirects: true });

    const list = await request({ method: 'GET', url: '/api/admin/probes?serviceId=wechat' });
    expect(list.json().data.items).toHaveLength(1);
    const other = await request({ method: 'GET', url: '/api/admin/probes?serviceId=qq' });
    expect(other.json().data.items).toHaveLength(0);
  });

  it('同一服务下不允许重名点位', async () => {
    expect((await createProbe(validBody)).statusCode).toBe(201);
    const duplicate = await createProbe({ ...validBody, target: 'https://example.com/other' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().message).toContain('已有点位');

    const otherService = await createProbe({ ...validBody, serviceId: 'qq' });
    expect(otherService.statusCode).toBe(201);
  });

  it('更新需要版本号，版本过期返回冲突', async () => {
    const created = await createProbe(validBody);
    const row = created.json().data as { id: string; version: number };
    const url = `/api/admin/probes/${row.id}`;

    const withoutVersion = await request({ method: 'PUT', url, payload: { name: '改名' } });
    expect(withoutVersion.statusCode).toBe(428);

    const stale = await request({
      method: 'PUT',
      url,
      payload: { name: '改名' },
      headers: { 'if-match': `"${row.version + 5}"` },
    });
    expect(stale.statusCode).toBe(409);

    const updated = await request({
      method: 'PUT',
      url,
      payload: { name: '改名', enabled: false },
      headers: { 'if-match': `"${row.version}"` },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ name: '改名', enabled: false, version: row.version + 1 });
  });

  it('改类型或目标会清掉上一次结果，等重新探测', async () => {
    const created = await createProbe(validBody);
    const row = created.json().data as { id: string; version: number };
    const url = `/api/admin/probes/${row.id}`;
    app.db
      .update(serviceProbes)
      .set({ lastStatus: 'down', lastLatencyMs: 5000, consecutiveFailures: 3, lastCheckedAt: Date.now() })
      .where(eq(serviceProbes.id, row.id))
      .run();

    const renamed = await request({
      method: 'PUT',
      url,
      payload: { name: '只改名' },
      headers: { 'if-match': `"${row.version}"` },
    });
    expect(renamed.json().data).toMatchObject({ lastStatus: 'down', consecutiveFailures: 3 });

    const retargeted = await request({
      method: 'PUT',
      url,
      payload: { target: 'https://example.com/other' },
      headers: { 'if-match': `"${row.version + 1}"` },
    });
    expect(retargeted.json().data).toMatchObject({
      lastStatus: null,
      lastCheckedAt: null,
      consecutiveFailures: 0,
      target: 'https://example.com/other',
    });
  });

  it('删除是软删除，列表不再返回', async () => {
    const created = await createProbe(validBody);
    const row = created.json().data as { id: string; version: number };
    const url = `/api/admin/probes/${row.id}`;

    const removed = await request({ method: 'DELETE', url, headers: { 'if-match': `"${row.version}"` } });
    expect(removed.statusCode).toBe(200);

    const list = await request({ method: 'GET', url: '/api/admin/probes' });
    expect(list.json().data.items).toHaveLength(0);

    const missing = await request({
      method: 'PUT',
      url,
      payload: { name: '复活' },
      headers: { 'if-match': `"${row.version + 1}"` },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('只读角色不能创建点位', async () => {
    const createdUser = await request({
      method: 'POST',
      url: '/api/admin/users',
      payload: {
        username: 'viewer1',
        displayName: '只读',
        role: 'viewer',
        isActive: true,
        password: 'viewer-pass-12345',
        mustChangePassword: false,
      },
    });
    expect(createdUser.statusCode).toBe(201);

    const viewerLogin = await request({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'viewer1', password: 'viewer-pass-12345' },
      cookie: null,
    });
    const viewerCookie = String(viewerLogin.headers['set-cookie']).split(';')[0];

    const denied = await createProbe(validBody, { cookie: viewerCookie });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('FORBIDDEN');

    const read = await request({ method: 'GET', url: '/api/admin/probes', cookie: viewerCookie });
    expect(read.statusCode).toBe(200);
  });
});
