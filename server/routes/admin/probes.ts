import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { serviceProbes, services } from '../../db/schema';
import type { JsonObject } from '../../domain';
import type { ProbeType } from '../../services/probe/registry';
import { ProbeConfigError } from '../../services/probe/registry';
import { refreshServiceStatus } from '../../services/probe/runner';
import { badRequest, conflict, notFound, ok } from '../../utils/api';
import {
  expectedVersion,
  objectBody,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requiredString,
  versionEtag,
} from '../../utils/validation';
import { actorId, ADMIN_READ_ROLES, auditAndRebuild, CONTENT_WRITE_ROLES, queryObject } from './helpers';

const NAME_MAX_LENGTH = 100;
const REGION_MAX_LENGTH = 50;
const TARGET_MAX_LENGTH = 2000;
const INTERVAL_MIN_SECONDS = 10;
const INTERVAL_MAX_SECONDS = 86_400;

function resolveType(app: FastifyInstance, value: unknown): ProbeType {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return badRequest('type 不能为空');
  try {
    return app.probeRegistry.get(name);
  } catch (error) {
    if (error instanceof ProbeConfigError) return badRequest(error.message);
    throw error;
  }
}

function parseTarget(type: ProbeType, value: unknown): string {
  const target = typeof value === 'string' ? value.trim() : '';
  if (!target) return badRequest('target 不能为空');
  if (target.length > TARGET_MAX_LENGTH) return badRequest(`target 长度不能超过 ${TARGET_MAX_LENGTH}`);
  try {
    return type.normalizeTarget(target);
  } catch (error) {
    if (error instanceof ProbeConfigError) return badRequest(error.message);
    throw error;
  }
}

function parseConfig(type: ProbeType, value: unknown): JsonObject {
  try {
    return type.parseConfig(value);
  } catch (error) {
    if (error instanceof ProbeConfigError) return badRequest(error.message);
    throw error;
  }
}

function assertNameFree(app: FastifyInstance, serviceId: string, name: string, exceptId?: string): void {
  const duplicate = app.db
    .select({ id: serviceProbes.id })
    .from(serviceProbes)
    .where(and(eq(serviceProbes.serviceId, serviceId), eq(serviceProbes.name, name), isNull(serviceProbes.deletedAt)))
    .get();
  if (duplicate && duplicate.id !== exceptId) conflict(`同一服务下已有点位「${name}」`);
}

export async function registerProbeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/probe-types', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (_request, reply) => {
    return ok(reply, {
      items: app.probeRegistry.list().map((type) => ({ name: type.name, label: type.label, fields: type.fields })),
    });
  });

  app.get('/api/admin/probes', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const query = queryObject(request.query);
    const serviceId = typeof query.serviceId === 'string' ? query.serviceId : undefined;
    const rows = app.db
      .select()
      .from(serviceProbes)
      .where(and(isNull(serviceProbes.deletedAt), serviceId ? eq(serviceProbes.serviceId, serviceId) : undefined))
      .orderBy(asc(serviceProbes.serviceId), asc(serviceProbes.position))
      .all();
    return ok(reply, { items: rows });
  });

  app.post('/api/admin/probes', { preHandler: requireRoles(...CONTENT_WRITE_ROLES) }, async (request, reply) => {
    const body = objectBody(request.body);
    const serviceId = requiredString(body, 'serviceId', 100);
    const service = app.db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.id, serviceId), isNull(services.deletedAt)))
      .get();
    if (!service) return notFound('服务不存在');

    const type = resolveType(app, body.type);
    const name = requiredString(body, 'name', NAME_MAX_LENGTH);
    assertNameFree(app, serviceId, name);

    const lastPosition = app.db
      .select({ position: serviceProbes.position })
      .from(serviceProbes)
      .where(and(eq(serviceProbes.serviceId, serviceId), isNull(serviceProbes.deletedAt)))
      .orderBy(desc(serviceProbes.position))
      .limit(1)
      .get();
    const now = Date.now();
    const actor = actorId(request);
    const row = {
      id: randomUUID(),
      serviceId,
      name,
      type: type.name,
      target: parseTarget(type, body.target),
      configJson: parseConfig(type, body.config),
      intervalSeconds:
        optionalInteger(body, 'intervalSeconds', INTERVAL_MIN_SECONDS, INTERVAL_MAX_SECONDS) ??
        app.appConfig.probeIntervalSeconds,
      region: optionalString(body, 'region', REGION_MAX_LENGTH),
      position: optionalInteger(body, 'position', 0) ?? (lastPosition?.position ?? -1) + 1,
      enabled: optionalBoolean(body, 'enabled') ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    app.db.insert(serviceProbes).values(row).run();
    refreshServiceStatus(app.db, serviceId, now);
    auditAndRebuild(app, request, { action: 'probe.created', entityType: 'probe', entityId: row.id, after: row });

    const created = app.db.select().from(serviceProbes).where(eq(serviceProbes.id, row.id)).get();
    reply.header('ETag', versionEtag(1));
    return ok(reply, created, '监控点位已创建', 201);
  });

  app.put<{ Params: { id: string } }>(
    '/api/admin/probes/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(serviceProbes)
        .where(and(eq(serviceProbes.id, request.params.id), isNull(serviceProbes.deletedAt)))
        .get();
      if (!current) return notFound('监控点位不存在');

      const type = body.type === undefined ? resolveType(app, current.type) : resolveType(app, body.type);
      const name = body.name === undefined ? current.name : requiredString(body, 'name', NAME_MAX_LENGTH);
      if (name !== current.name) assertNameFree(app, current.serviceId, name, current.id);

      const target = body.target === undefined ? current.target : parseTarget(type, body.target);
      const next = {
        name,
        type: type.name,
        target,
        configJson: body.config === undefined ? current.configJson : parseConfig(type, body.config),
        intervalSeconds:
          optionalInteger(body, 'intervalSeconds', INTERVAL_MIN_SECONDS, INTERVAL_MAX_SECONDS) ??
          current.intervalSeconds,
        region:
          body.region === undefined ? current.region : (optionalString(body, 'region', REGION_MAX_LENGTH) ?? null),
        position: optionalInteger(body, 'position', 0) ?? current.position,
        enabled: optionalBoolean(body, 'enabled') ?? current.enabled,
      };
      // 换了类型或目标之后，上一次结果不再代表这个点位。
      const checkChanged = next.type !== current.type || next.target !== current.target;

      const now = Date.now();
      const result = app.db
        .update(serviceProbes)
        .set({
          ...next,
          ...(checkChanged
            ? { lastCheckedAt: null, lastStatus: null, lastLatencyMs: null, consecutiveFailures: 0 }
            : {}),
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${serviceProbes.version} + 1`,
        })
        .where(
          and(eq(serviceProbes.id, current.id), eq(serviceProbes.version, version), isNull(serviceProbes.deletedAt)),
        )
        .run();
      if (result.changes === 0) return conflict();

      refreshServiceStatus(app.db, current.serviceId, now);
      const updated = app.db.select().from(serviceProbes).where(eq(serviceProbes.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'probe.updated',
        entityType: 'probe',
        entityId: current.id,
        before: current,
        after: updated,
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated, '监控点位已更新');
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/probes/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(serviceProbes)
        .where(and(eq(serviceProbes.id, request.params.id), isNull(serviceProbes.deletedAt)))
        .get();
      if (!current) return notFound('监控点位不存在');

      const now = Date.now();
      const result = app.db
        .update(serviceProbes)
        .set({
          deletedAt: now,
          deletedBy: actorId(request),
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${serviceProbes.version} + 1`,
        })
        .where(
          and(eq(serviceProbes.id, current.id), eq(serviceProbes.version, version), isNull(serviceProbes.deletedAt)),
        )
        .run();
      if (result.changes === 0) return conflict();

      refreshServiceStatus(app.db, current.serviceId, now);
      auditAndRebuild(app, request, {
        action: 'probe.deleted',
        entityType: 'probe',
        entityId: current.id,
        before: current,
      });
      return ok(reply, { id: current.id, version: version + 1 }, '监控点位已删除');
    },
  );
}
