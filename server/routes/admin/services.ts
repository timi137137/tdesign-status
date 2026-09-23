import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { services, serviceSamples } from '../../db/schema';
import { SERVICE_STATUSES } from '../../domain';
import { badRequest, conflict, notFound, ok } from '../../utils/api';
import {
  enumValue,
  expectedVersion,
  normalizeSlug,
  objectBody,
  optionalBoolean,
  optionalEnumValue,
  optionalInteger,
  optionalString,
  requiredBoolean,
  requiredInteger,
  requiredString,
  versionEtag,
} from '../../utils/validation';
import { actorId, ADMIN_READ_ROLES, auditAndRebuild, CONTENT_WRITE_ROLES } from './helpers';

function optionalNumber(
  body: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return badRequest(`${key} 必须是 ${minimum} 至 ${maximum} 之间的数字`);
  }
  return value;
}

export async function registerServiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/services', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (_request, reply) => {
    const rows = app.db.select().from(services).where(isNull(services.deletedAt)).orderBy(asc(services.position)).all();
    return ok(reply, { items: rows });
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/services/:id',
    { preHandler: requireRoles(...ADMIN_READ_ROLES) },
    async (request, reply) => {
      const row = app.db
        .select()
        .from(services)
        .where(and(eq(services.id, request.params.id), isNull(services.deletedAt)))
        .get();
      if (!row) return notFound('服务不存在');
      reply.header('ETag', versionEtag(row.version));
      return ok(reply, row);
    },
  );

  app.post('/api/admin/services', { preHandler: requireRoles(...CONTENT_WRITE_ROLES) }, async (request, reply) => {
    const body = objectBody(request.body);
    const now = Date.now();
    const actor = actorId(request);
    const maxPosition =
      app.db
        .select({ position: services.position })
        .from(services)
        .where(isNull(services.deletedAt))
        .orderBy(sql`${services.position} DESC`)
        .limit(1)
        .get()?.position ?? -1;
    const row = {
      id: randomUUID(),
      slug: normalizeSlug(requiredString(body, 'slug', 80)),
      name: requiredString(body, 'name', 100),
      description: optionalString(body, 'description', 2000),
      status: enumValue(body, 'status', SERVICE_STATUSES),
      enabled: requiredBoolean(body, 'enabled'),
      position: optionalInteger(body, 'position', 0) ?? maxPosition + 1,
      uptime: optionalNumber(body, 'uptime', 0, 100) ?? 100,
      latencyMs: optionalInteger(body, 'latencyMs', 0, 600000) ?? 0,
      lastCheckAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    app.db.insert(services).values(row).run();
    app.db
      .insert(serviceSamples)
      .values({
        id: randomUUID(),
        serviceId: row.id,
        observedAt: now,
        status: row.status,
        heartbeatValue:
          row.status === 'down' ? 0 : row.status === 'maintenance' ? 2 : row.status === 'degraded' ? 3 : 1,
        latencyMs: row.latencyMs,
        uptime: row.uptime,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      })
      .run();
    auditAndRebuild(app, request, {
      action: 'service.created',
      entityType: 'service',
      entityId: row.id,
      after: row,
    });
    const created = app.db.select().from(services).where(eq(services.id, row.id)).get();
    reply.header('ETag', versionEtag(1));
    return ok(reply, created, '服务已创建', 201);
  });

  app.put<{ Params: { id: string } }>(
    '/api/admin/services/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(services)
        .where(and(eq(services.id, request.params.id), isNull(services.deletedAt)))
        .get();
      if (!current) return notFound('服务不存在');
      const now = Date.now();
      const next = {
        slug: body.slug === undefined ? current.slug : normalizeSlug(requiredString(body, 'slug', 80)),
        name: body.name === undefined ? current.name : requiredString(body, 'name', 100),
        description:
          body.description === undefined ? current.description : optionalString(body, 'description', 2000) ?? null,
        status: optionalEnumValue(body, 'status', SERVICE_STATUSES) ?? current.status,
        enabled: optionalBoolean(body, 'enabled') ?? current.enabled,
        position: optionalInteger(body, 'position', 0) ?? current.position,
        uptime: optionalNumber(body, 'uptime', 0, 100) ?? current.uptime,
        latencyMs: optionalInteger(body, 'latencyMs', 0, 600000) ?? current.latencyMs,
      };
      const result = app.db
        .update(services)
        .set({
          ...next,
          lastCheckAt: now,
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${services.version} + 1`,
        })
        .where(and(eq(services.id, current.id), eq(services.version, version), isNull(services.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      if (next.status !== current.status || next.latencyMs !== current.latencyMs || next.uptime !== current.uptime) {
        app.db
          .insert(serviceSamples)
          .values({
            id: randomUUID(),
            serviceId: current.id,
            observedAt: now,
            status: next.status,
            heartbeatValue:
              next.status === 'down' ? 0 : next.status === 'maintenance' ? 2 : next.status === 'degraded' ? 3 : 1,
            latencyMs: next.latencyMs,
            uptime: next.uptime,
            createdAt: now,
            updatedAt: now,
            createdBy: actorId(request),
            updatedBy: actorId(request),
          })
          .run();
      }
      const updated = app.db.select().from(services).where(eq(services.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'service.updated',
        entityType: 'service',
        entityId: current.id,
        before: current,
        after: updated,
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated, '服务已更新');
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/services/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(services)
        .where(and(eq(services.id, request.params.id), isNull(services.deletedAt)))
        .get();
      if (!current) return notFound('服务不存在');
      const now = Date.now();
      const result = app.db
        .update(services)
        .set({
          deletedAt: now,
          deletedBy: actorId(request),
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${services.version} + 1`,
        })
        .where(and(eq(services.id, current.id), eq(services.version, version), isNull(services.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      auditAndRebuild(app, request, {
        action: 'service.deleted',
        entityType: 'service',
        entityId: current.id,
        before: current,
      });
      return ok(reply, { id: current.id, version: version + 1 }, '服务已删除');
    },
  );

  app.post(
    '/api/admin/services/reorder',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 500) {
        return badRequest('items 必须是 1 至 500 项的数组');
      }
      const items = body.items.map((value) => {
        const item = objectBody(value);
        return {
          id: requiredString(item, 'id', 100),
          version: requiredInteger(item, 'version', 1),
          position: requiredInteger(item, 'position', 0),
        };
      });
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        return badRequest('items 中存在重复 id');
      }
      const before = app.db
        .select()
        .from(services)
        .where(isNull(services.deletedAt))
        .orderBy(asc(services.position))
        .all();
      const actor = actorId(request);
      const now = Date.now();
      app.db.transaction((tx) => {
        for (const item of items) {
          const result = tx
            .update(services)
            .set({
              position: item.position,
              updatedAt: now,
              updatedBy: actor,
              version: sql`${services.version} + 1`,
            })
            .where(and(eq(services.id, item.id), eq(services.version, item.version), isNull(services.deletedAt)))
            .run();
          if (result.changes === 0) return conflict();
        }
      });
      const after = app.db
        .select()
        .from(services)
        .where(isNull(services.deletedAt))
        .orderBy(asc(services.position))
        .all();
      auditAndRebuild(app, request, {
        action: 'service.reordered',
        entityType: 'service',
        before: { items: before.map(({ id, position, version }) => ({ id, position, version })) },
        after: { items: after.map(({ id, position, version }) => ({ id, position, version })) },
      });
      return ok(reply, { items: after }, '服务顺序已更新');
    },
  );
}
