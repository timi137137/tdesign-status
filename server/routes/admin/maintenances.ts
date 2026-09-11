import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import type { AppDatabase } from '../../db/client';
import { maintenances, maintenanceUpdates } from '../../db/schema';
import { MAINTENANCE_STATUSES, PUBLISH_STATES } from '../../domain';
import { softDeleteEntityServices, syncEntityServices } from '../../services/entities';
import { materializeMaintenance } from '../../services/snapshot';
import { badRequest, conflict, notFound, ok } from '../../utils/api';
import {
  enumValue,
  expectedVersion,
  objectBody,
  optionalEnumValue,
  optionalInteger,
  optionalString,
  pagination,
  requiredInteger,
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
  maintenanceView,
  queryObject,
} from './helpers';

export async function registerMaintenanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/maintenances', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const page = pagination(request.query);
    const query = queryObject(request.query);
    const search = optionalString(query, 'search', 200)?.toLocaleLowerCase('zh-CN');
    const status = optionalEnumValue(query, 'status', MAINTENANCE_STATUSES);
    const publishState = optionalEnumValue(query, 'publishState', PUBLISH_STATES);
    const serviceId = optionalString(query, 'serviceId', 64);
    const relatedIds = serviceId ? entityIdsForService(app, 'maintenance', serviceId) : null;
    const rows = app.db
      .select()
      .from(maintenances)
      .where(isNull(maintenances.deletedAt))
      .orderBy(desc(maintenances.scheduledStart))
      .all()
      .filter((row) => {
        if (search && !row.title.toLocaleLowerCase('zh-CN').includes(search)) return false;
        if (status && row.status !== status) return false;
        if (publishState && row.publishState !== publishState) return false;
        if (relatedIds && !relatedIds.has(row.id)) return false;
        return true;
      });
    return ok(reply, {
      items: rows.slice(page.offset, page.offset + page.pageSize).map((row) => maintenanceView(app, row)),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: rows.length,
        totalPages: Math.ceil(rows.length / page.pageSize),
      },
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/maintenances/:id',
    { preHandler: requireRoles(...ADMIN_READ_ROLES) },
    async (request, reply) => {
      const row = app.db
        .select()
        .from(maintenances)
        .where(and(eq(maintenances.id, request.params.id), isNull(maintenances.deletedAt)))
        .get();
      if (!row) return notFound('维护不存在');
      reply.header('ETag', versionEtag(row.version));
      return ok(reply, maintenanceView(app, row));
    },
  );

  app.post('/api/admin/maintenances', { preHandler: requireRoles(...CONTENT_WRITE_ROLES) }, async (request, reply) => {
    const body = objectBody(request.body);
    const actor = actorId(request);
    const now = Date.now();
    const id = randomUUID();
    const updateId = randomUUID();
    const scheduledStart = requiredInteger(body, 'scheduledStart', 0);
    const scheduledEnd = requiredInteger(body, 'scheduledEnd', 0);
    if (scheduledEnd <= scheduledStart) {
      return badRequest('scheduledEnd 必须晚于 scheduledStart');
    }
    const affectedServiceIds = requiredStringArray(body, 'affectedServiceIds');
    const row = {
      id,
      title: requiredString(body, 'title', 200),
      description: optionalString(body, 'description', 5000),
      status: 'scheduled' as const,
      scheduledStart,
      scheduledEnd,
      progress: 0,
      publishState: 'draft' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    const updateBody = requiredString(body, 'body', 10000);
    app.db.transaction((tx) => {
      tx.insert(maintenances).values(row).run();
      tx.insert(maintenanceUpdates)
        .values({
          id: updateId,
          maintenanceId: id,
          status: 'scheduled',
          body: updateBody,
          progress: 0,
          occurredAt: now,
          publishState: 'draft',
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
        })
        .run();
      syncEntityServices(tx as unknown as AppDatabase, 'maintenance', id, affectedServiceIds, actor);
    });
    const created = app.db.select().from(maintenances).where(eq(maintenances.id, id)).get();
    auditAndRebuild(app, request, {
      action: 'maintenance.created',
      entityType: 'maintenance',
      entityId: id,
      after: created ? maintenanceView(app, created) : row,
    });
    reply.header('ETag', versionEtag(1));
    return ok(reply, created ? maintenanceView(app, created) : row, '维护草稿已创建', 201);
  });

  app.put<{ Params: { id: string } }>(
    '/api/admin/maintenances/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(maintenances)
        .where(and(eq(maintenances.id, request.params.id), isNull(maintenances.deletedAt)))
        .get();
      if (!current) return notFound('维护不存在');
      const now = Date.now();
      const nextStatus = optionalEnumValue(body, 'status', MAINTENANCE_STATUSES) ?? current.status;
      const nextProgress =
        optionalInteger(body, 'progress', 0, 100) ?? (nextStatus === 'completed' ? 100 : current.progress);
      const next = {
        title: body.title === undefined ? current.title : requiredString(body, 'title', 200),
        description:
          body.description === undefined ? current.description : optionalString(body, 'description', 5000) ?? null,
        status: nextStatus,
        scheduledStart: optionalInteger(body, 'scheduledStart', 0) ?? current.scheduledStart,
        scheduledEnd: optionalInteger(body, 'scheduledEnd', 0) ?? current.scheduledEnd,
        progress: nextProgress,
      };
      if (next.scheduledEnd <= next.scheduledStart) {
        return badRequest('scheduledEnd 必须晚于 scheduledStart');
      }
      const affectedServiceIds =
        body.affectedServiceIds === undefined ? undefined : requiredStringArray(body, 'affectedServiceIds');
      const before = maintenanceView(app, current);
      app.db.transaction((tx) => {
        const result = tx
          .update(maintenances)
          .set({
            ...next,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenances.version} + 1`,
          })
          .where(
            and(eq(maintenances.id, current.id), eq(maintenances.version, version), isNull(maintenances.deletedAt)),
          )
          .run();
        if (result.changes === 0) return conflict();
        if (affectedServiceIds) {
          syncEntityServices(
            tx as unknown as AppDatabase,
            'maintenance',
            current.id,
            affectedServiceIds,
            actorId(request),
          );
        }
      });
      const updated = app.db.select().from(maintenances).where(eq(maintenances.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'maintenance.updated',
        entityType: 'maintenance',
        entityId: current.id,
        before,
        after: updated ? maintenanceView(app, updated) : next,
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? maintenanceView(app, updated) : next, '维护草稿已更新');
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/maintenances/:id/updates',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(maintenances)
        .where(and(eq(maintenances.id, request.params.id), isNull(maintenances.deletedAt)))
        .get();
      if (!current) return notFound('维护不存在');
      const status = enumValue(body, 'status', MAINTENANCE_STATUSES);
      const progress = optionalInteger(body, 'progress', 0, 100) ?? (status === 'completed' ? 100 : current.progress);
      const now = Date.now();
      const updateId = randomUUID();
      app.db.transaction((tx) => {
        const result = tx
          .update(maintenances)
          .set({
            status,
            progress,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenances.version} + 1`,
          })
          .where(
            and(eq(maintenances.id, current.id), eq(maintenances.version, version), isNull(maintenances.deletedAt)),
          )
          .run();
        if (result.changes === 0) return conflict();
        tx.insert(maintenanceUpdates)
          .values({
            id: updateId,
            maintenanceId: current.id,
            status,
            body: requiredString(body, 'body', 10000),
            progress,
            occurredAt: optionalInteger(body, 'occurredAt', 0) ?? now,
            publishState: 'draft',
            createdAt: now,
            updatedAt: now,
            createdBy: actorId(request),
            updatedBy: actorId(request),
          })
          .run();
      });
      const updated = app.db.select().from(maintenances).where(eq(maintenances.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'maintenance.update_appended',
        entityType: 'maintenance',
        entityId: current.id,
        after: { updateId, status, progress, version: version + 1 },
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? maintenanceView(app, updated) : null, '维护进展已追加');
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/maintenances/:id/publish',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(maintenances)
        .where(and(eq(maintenances.id, request.params.id), isNull(maintenances.deletedAt)))
        .get();
      if (!current) return notFound('维护不存在');
      if (current.version !== version) return conflict();
      const before = current.publishedJson;
      const now = Date.now();
      const payload = {
        ...materializeMaintenance(app.db, current),
        version: version + 1,
        updatedAt: now,
      };
      app.db.transaction((tx) => {
        tx.update(maintenanceUpdates)
          .set({
            publishState: 'published',
            publishedAt: now,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenanceUpdates.version} + 1`,
          })
          .where(and(eq(maintenanceUpdates.maintenanceId, current.id), isNull(maintenanceUpdates.deletedAt)))
          .run();
        const result = tx
          .update(maintenances)
          .set({
            publishState: 'published',
            publishedAt: now,
            publishedJson: payload,
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenances.version} + 1`,
          })
          .where(
            and(eq(maintenances.id, current.id), eq(maintenances.version, version), isNull(maintenances.deletedAt)),
          )
          .run();
        if (result.changes === 0) return conflict();
      });
      auditAndRebuild(app, request, {
        action: 'maintenance.published',
        entityType: 'maintenance',
        entityId: current.id,
        before,
        after: payload,
      });
      const updated = app.db.select().from(maintenances).where(eq(maintenances.id, current.id)).get();
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? maintenanceView(app, updated) : payload, '维护已发布');
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/maintenances/:id',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(maintenances)
        .where(and(eq(maintenances.id, request.params.id), isNull(maintenances.deletedAt)))
        .get();
      if (!current) return notFound('维护不存在');
      const before = maintenanceView(app, current);
      const now = Date.now();
      app.db.transaction((tx) => {
        const result = tx
          .update(maintenances)
          .set({
            deletedAt: now,
            deletedBy: actorId(request),
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenances.version} + 1`,
          })
          .where(
            and(eq(maintenances.id, current.id), eq(maintenances.version, version), isNull(maintenances.deletedAt)),
          )
          .run();
        if (result.changes === 0) return conflict();
        tx.update(maintenanceUpdates)
          .set({
            deletedAt: now,
            deletedBy: actorId(request),
            updatedAt: now,
            updatedBy: actorId(request),
            version: sql`${maintenanceUpdates.version} + 1`,
          })
          .where(and(eq(maintenanceUpdates.maintenanceId, current.id), isNull(maintenanceUpdates.deletedAt)))
          .run();
        softDeleteEntityServices(tx as unknown as AppDatabase, 'maintenance', current.id, actorId(request));
      });
      auditAndRebuild(app, request, {
        action: 'maintenance.deleted',
        entityType: 'maintenance',
        entityId: current.id,
        before,
      });
      return ok(reply, { id: current.id, version: version + 1 }, '维护已删除');
    },
  );
}
