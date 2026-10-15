import { mkdtempSync, rmSync } from 'node:fs';
import type { RequestListener } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { asc, eq } from 'drizzle-orm';

import type { ServerConfig } from '../../server/config';
import type { AppDatabase, DatabaseContext } from '../../server/db/client';
import { openDatabase } from '../../server/db/client';
import { applyMigrations } from '../../server/db/migrate';
import type { ServiceProbeRow, ServiceRow } from '../../server/db/schema';
import { serviceProbes, services, serviceSamples, serviceStateEvents } from '../../server/db/schema';
import type { ServiceStatus } from '../../server/domain';

const cleanups: Array<() => Promise<void> | void> = [];

/** 释放本用例申请的全部资源：先关库再删目录。 */
export async function closeFixtures(): Promise<void> {
  for (const cleanup of cleanups.splice(0)) await cleanup();
}

export function mustGet<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`缺少${label}`);
  return row;
}

export function openTestDatabase(): DatabaseContext {
  const dir = mkdtempSync(join(tmpdir(), 'status-probe-'));
  const context = openDatabase({ databasePath: join(dir, 'status.db') } as ServerConfig);
  applyMigrations(context, join(process.cwd(), 'server/db/migrations'));
  cleanups.push(() => {
    context.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return context;
}

export function startHttpServer(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      cleanups.push(
        () =>
          new Promise<void>((closed) => {
            server.closeAllConnections();
            server.close(() => closed());
          }),
      );
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

export function startTcpServer(): Promise<string> {
  const server = createTcpServer((socket) => socket.end());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      cleanups.push(() => new Promise<void>((closed) => server.close(() => closed())));
      resolve(`127.0.0.1:${port}`);
    });
  });
}

export function idleSignal(): AbortSignal {
  return new AbortController().signal;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('等待条件超时');
    await sleep(10);
  }
}

export function insertService(db: AppDatabase, id: string, status: ServiceStatus = 'up'): void {
  const now = Date.now();
  db.insert(services)
    .values({
      id,
      slug: id,
      name: id,
      status,
      enabled: true,
      position: 0,
      uptime: 100,
      latencyMs: 0,
      lastCheckAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function insertProbe(
  db: AppDatabase,
  input: {
    id: string;
    serviceId: string;
    target: string;
    type?: string;
    enabled?: boolean;
    intervalSeconds?: number;
    lastCheckedAt?: number | null;
  },
): void {
  const now = Date.now();
  db.insert(serviceProbes)
    .values({
      id: input.id,
      serviceId: input.serviceId,
      name: input.id,
      type: input.type ?? 'http',
      target: input.target,
      configJson: {},
      intervalSeconds: input.intervalSeconds ?? 60,
      position: 0,
      enabled: input.enabled ?? true,
      lastCheckedAt: input.lastCheckedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function readProbe(db: AppDatabase, id: string): ServiceProbeRow {
  return mustGet(db.select().from(serviceProbes).where(eq(serviceProbes.id, id)).get(), `点位 ${id}`);
}

export function readService(db: AppDatabase, id: string): ServiceRow {
  return mustGet(db.select().from(services).where(eq(services.id, id)).get(), `服务 ${id}`);
}

export function readSamples(db: AppDatabase) {
  return db.select().from(serviceSamples).orderBy(asc(serviceSamples.observedAt)).all();
}

export function readStateEvents(db: AppDatabase) {
  return db.select().from(serviceStateEvents).orderBy(asc(serviceStateEvents.at)).all();
}
