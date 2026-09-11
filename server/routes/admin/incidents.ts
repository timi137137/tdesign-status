import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import type { AppDatabase } from '../../db/client';
import { incidents, incidentUpdates } from '../../db/schema';
import { INCIDENT_IMPACTS, INCIDENT_STATUSES, PUBLISH_STATES } from '../../domain';
import { softDeleteEntityServices, syncEntityServices } from '../../services/entities';
import { materializeIncident } from '../../services/snapshot';
import { conflict, notFound, ok } from '../../utils/api';
import {
  enumValue,
  expectedVersion,
  objectBody,
  optionalEnumValue,
  optionalInteger,
  optionalString,
  pagination,
  requiredString,
  requiredStringArray,
  versionEtag,
} from '../../utils/validation';
import {
  actorId,
  ADMIN_READ_ROLES,
  auditAndRebuild,
  CONTENT_WRITE_ROLES,
  entityIdsForService,
  incidentView,
  queryObject,
} from './helpers';

export async function registerIncidentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/incidents', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const page = pagination(request.query);
    const query = queryObject(request.query);
    const search = optionalString(query, 'search', 200)?.toLocaleLowerCase('zh-CN');
    const status = optionalEnumValue(query, 'status', INCIDENT_STATUSES);
    const impact = optionalEnumValue(query, 'impact', INCIDENT_IMPACTS);
    const publishState = optionalEnumValue(query, 'publishState', PUBLISH_STATES);
    const serviceId = optionalString(query, 'serviceId', 64);
    const relatedIds = serviceId ? entityIdsForService(app, 'incident', serviceId) : null;
    const rows = app.db
      .select()
      .from(incidents)
      .where(isNull(incidents.deletedAt))
      .orderBy(desc(incidents.startedAt))
      .all()
      .filter((row) => {
        if (search && !row.title.toLocaleLowerCase('zh-CN').includes(search)) return false;
        if (status && row.status !== status) return false;
        if (impact && row.impact !== impact) return false;
        if (publishState && row.publishState !== publishState) return false;
        if (relatedIds && !relatedIds.has(row.id)) return false;
        return true;
      });
    return ok(reply, {
      items: rows.slice(page.offset, page.offset + page.pageSize).map((row) => incidentView(app, row)),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: rows.length,
        totalPages: Math.ceil(rows.length / page.pageSize),
      },
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/incidents/:id',
    { preHandler: requireRoles(...ADMIN_READ_ROLES) },
    async (request, reply) => {
      const row = app.db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, request.params.id), isNull(incidents.deletedAt)))
        .get();
      if (!row) return notFound('事件不存在');
      reply.header('ETag', versionEtag(row.version));
      return ok(reply, incidentView(app, row));
    },
  );

  app.post('/api/admin/incidents', { preHandler: requireRoles(...CONTENT_WRITE_ROLES) }, async (request, reply) => {
    const body = objectBody(request.body);
    const actor = actorId(request);
    const now = Date.now();
    const id = randomUUID();
    const updateId = randomUUID();
    const affectedServiceIds = requiredStringArray(body, 'affectedServiceIds');
    const row = {
      id,
      title: requiredString(body, 'title', 200),
      impact: enumValue(body, 'impact', INCIDENT_IMPACTS),
      status: 'investigating' as const,
      startedAt: optionalInteger(body, 'startedAt', 0) ?? now,
      publishState: 'draft' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    const updateBody = requiredString(body, 'body', 10000);
    app.db.transaction((tx) => {
      tx.insert(incidents).values(row).run();
      tx.insert(incidentUpdates)
        .values({
          id: updateId,
          incidentId: id,
          status: 'investigating',
          body: updateBody,
          occurredAt: now,
          publishState: 'draft',
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
        })
        .run();
      syncEntityServices(tx as unknown as AppDatabase, 'incident', id, affectedServiceIds, actor);
    });
    const created = app.db.select().from(incidents).where(eq(incidents.id, id)).get();
    auditAndRebuild(app, request, {
      action: 'incident.created',
      entityType: 'incident',
      entityId: id,
      after: created ? incidentView(app, created) : row,
    });
    reply.header('ETag', versionEtag(1));
    return ok(reply, created ? incidentView(app, created) : row, '事件草稿已创建', 201);
  });

  app.put<{ Params: { id: string } }>(
    '/api/admin/incidents/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, request.params.id), isNull(incidents.deletedAt)))
        .get();
      if (!current) return notFound('事件不存在');
      const nextStatus = optionalEnumValue(body, 'status', INCIDENT_STATUSES) ?? current.status;
      const now = Date.now();
      const affectedServiceIds =
        body.affectedServiceIds === undefined ? undefined : requiredStringArray(body, 'affectedServiceIds');
      const next = {
        title: body.title === undefined ? current.title : requiredString(body, 'title', 200),
        impact: optionalEnumValue(body, 'impact', INCIDENT_IMPACTS) ?? current.impact,
        status: nextStatus,
        startedAt: optionalInteger(body, 'startedAt', 0) ?? current.startedAt,
        resolvedAt:
          nextStatus === 'resolved' ? optionalInteger(body, 'resolvedAt', 0) ?? current.resolvedAt ?? now : null,
      };
      const before = incidentView(app, current);
      app.db.transaction((tx) => {
        const result = tx
          .update(incidents)
          .set({
            ...next,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidents.version} + 1`,
          })
          .where(and(eq(incidents.id, current.id), eq(incidents.version, version), isNull(incidents.deletedAt)))
          .run();
        if (result.changes === 0) return conflict();
        if (affectedServiceIds) {
          syncEntityServices(
            tx as unknown as AppDatabase,
            'incident',
            current.id,
            affectedServiceIds,
            actorId(request),
          );
        }
      });
      const updated = app.db.select().from(incidents).where(eq(incidents.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'incident.updated',
        entityType: 'incident',
        entityId: current.id,
        before,
        after: updated ? incidentView(app, updated) : next,
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? incidentView(app, updated) : next, '事件草稿已更新');
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/incidents/:id/updates',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, request.params.id), isNull(incidents.deletedAt)))
        .get();
      if (!current) return notFound('事件不存在');
      const status = enumValue(body, 'status', INCIDENT_STATUSES);
      const now = Date.now();
      const updateId = randomUUID();
      app.db.transaction((tx) => {
        const result = tx
          .update(incidents)
          .set({
            status,
            resolvedAt: status === 'resolved' ? now : null,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidents.version} + 1`,
          })
          .where(and(eq(incidents.id, current.id), eq(incidents.version, version), isNull(incidents.deletedAt)))
          .run();
        if (result.changes === 0) return conflict();
        tx.insert(incidentUpdates)
          .values({
            id: updateId,
            incidentId: current.id,
            status,
            body: requiredString(body, 'body', 10000),
            occurredAt: optionalInteger(body, 'occurredAt', 0) ?? now,
            publishState: 'draft',
            createdAt: now,
            updatedAt: now,
            createdBy: actorId(request),
            updatedBy: actorId(request),
          })
          .run();
      });
      const updated = app.db.select().from(incidents).where(eq(incidents.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'incident.update_appended',
        entityType: 'incident',
        entityId: current.id,
        after: { updateId, status, version: version + 1 },
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? incidentView(app, updated) : null, '事件进展已追加');
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/incidents/:id/publish',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, request.params.id), isNull(incidents.deletedAt)))
        .get();
      if (!current) return notFound('事件不存在');
      if (current.version !== version) return conflict();
      const before = current.publishedJson;
      const now = Date.now();
      const payload = {
        ...materializeIncident(app.db, current),
        version: version + 1,
        updatedAt: now,
      };
      app.db.transaction((tx) => {
        tx.update(incidentUpdates)
          .set({
            publishState: 'published',
            publishedAt: now,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidentUpdates.version} + 1`,
          })
          .where(and(eq(incidentUpdates.incidentId, current.id), isNull(incidentUpdates.deletedAt)))
          .run();
        const result = tx
          .update(incidents)
          .set({
            publishState: 'published',
            publishedAt: now,
            publishedJson: payload,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidents.version} + 1`,
          })
          .where(and(eq(incidents.id, current.id), eq(incidents.version, version), isNull(incidents.deletedAt)))
          .run();
        if (result.changes === 0) return conflict();
      });
      auditAndRebuild(app, request, {
        action: 'incident.published',
        entityType: 'incident',
        entityId: current.id,
        before,
        after: payload,
      });
      const updated = app.db.select().from(incidents).where(eq(incidents.id, current.id)).get();
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? incidentView(app, updated) : payload, '事件已发布');
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/incidents/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, request.params.id), isNull(incidents.deletedAt)))
        .get();
      if (!current) return notFound('事件不存在');
      const before = incidentView(app, current);
      const now = Date.now();
      app.db.transaction((tx) => {
        const result = tx
          .update(incidents)
          .set({
            deletedAt: now,
            deletedBy: actorId(request),
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidents.version} + 1`,
          })
          .where(and(eq(incidents.id, current.id), eq(incidents.version, version), isNull(incidents.deletedAt)))
          .run();
        if (result.changes === 0) return conflict();
        tx.update(incidentUpdates)
          .set({
            deletedAt: now,
            deletedBy: actorId(request),
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${incidentUpdates.version} + 1`,
          })
          .where(and(eq(incidentUpdates.incidentId, current.id), isNull(incidentUpdates.deletedAt)))
          .run();
        softDeleteEntityServices(tx as unknown as AppDatabase, 'incident', current.id, actorId(request));
      });
      auditAndRebuild(app, request, {
        action: 'incident.deleted',
        entityType: 'incident',
        entityId: current.id,
        before,
      });
      return ok(reply, { id: current.id, version: version + 1 }, '事件已删除');
    },
  );
}
