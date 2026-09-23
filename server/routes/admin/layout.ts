import { randomUUID } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { dashboardLayouts } from '../../db/schema';
import { writeAudit } from '../../services/audit';
import { conflict, ok } from '../../utils/api';
import { expectedVersion, objectBody, optionalString, requiredJsonObject, versionEtag } from '../../utils/validation';
import { actorId, ADMIN_READ_ROLES } from './helpers';

function layoutName(query: unknown): string {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return 'default';
  const value = (query as Record<string, unknown>).name;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : 'default';
}

export async function registerLayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/dashboard-layout', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const row = app.db
      .select()
      .from(dashboardLayouts)
      .where(
        and(
          eq(dashboardLayouts.userId, actorId(request)),
          eq(dashboardLayouts.name, layoutName(request.query)),
          isNull(dashboardLayouts.deletedAt),
        ),
      )
      .get();
    if (row) reply.header('ETag', versionEtag(row.version));
    return ok(reply, row ?? null);
  });

  app.put('/api/admin/dashboard-layout', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const body = objectBody(request.body);
    const name = optionalString(body, 'name', 100) ?? 'default';
    const layoutJson = requiredJsonObject(body, 'layout');
    const actor = actorId(request);
    const current = app.db
      .select()
      .from(dashboardLayouts)
      .where(
        and(eq(dashboardLayouts.userId, actor), eq(dashboardLayouts.name, name), isNull(dashboardLayouts.deletedAt)),
      )
      .get();
    const now = Date.now();
    if (!current) {
      const id = randomUUID();
      app.db
        .insert(dashboardLayouts)
        .values({
          id,
          userId: actor,
          name,
          layoutJson,
          isDefault: name === 'default',
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
        })
        .run();
      const created = app.db.select().from(dashboardLayouts).where(eq(dashboardLayouts.id, id)).get();
      writeAudit(app.db, request, {
        action: 'dashboard_layout.created',
        entityType: 'dashboard_layout',
        entityId: id,
        after: created,
      });
      reply.header('ETag', versionEtag(1));
      return ok(reply, created, '仪表盘布局已创建', 201);
    }

    const version = expectedVersion(request, body);
    const result = app.db
      .update(dashboardLayouts)
      .set({
        layoutJson,
        updatedAt: now,
        updatedBy: actor,
        version: sql`${dashboardLayouts.version} + 1`,
      })
      .where(
        and(
          eq(dashboardLayouts.id, current.id),
          eq(dashboardLayouts.version, version),
          isNull(dashboardLayouts.deletedAt),
        ),
      )
      .run();
    if (result.changes === 0) return conflict();
    const updated = app.db.select().from(dashboardLayouts).where(eq(dashboardLayouts.id, current.id)).get();
    writeAudit(app.db, request, {
      action: 'dashboard_layout.updated',
      entityType: 'dashboard_layout',
      entityId: current.id,
      before: current,
      after: updated,
    });
    reply.header('ETag', versionEtag(version + 1));
    return ok(reply, updated, '仪表盘布局已更新');
  });
}
