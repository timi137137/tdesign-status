import { and, count, desc, eq, gte, isNull, like, lte, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { auditLogs } from '../../db/schema';
import { ok } from '../../utils/api';
import { pagination } from '../../utils/validation';

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/audit', { preHandler: requireRoles('administrator') }, async (request, reply) => {
    const page = pagination(request.query);
    const query = request.query && typeof request.query === 'object' ? (request.query as Record<string, unknown>) : {};
    const conditions: SQL[] = [isNull(auditLogs.deletedAt)];
    if (typeof query.action === 'string' && query.action.trim()) {
      conditions.push(like(auditLogs.action, `%${query.action.trim()}%`));
    }
    if (typeof query.entityType === 'string' && query.entityType.trim()) {
      conditions.push(eq(auditLogs.entityType, query.entityType.trim()));
    }
    if (typeof query.actorUserId === 'string' && query.actorUserId.trim()) {
      conditions.push(eq(auditLogs.actorUserId, query.actorUserId.trim()));
    }
    const from = typeof query.from === 'string' ? Number(query.from) : query.from;
    const to = typeof query.to === 'string' ? Number(query.to) : query.to;
    if (typeof from === 'number' && Number.isSafeInteger(from) && from >= 0) {
      conditions.push(gte(auditLogs.createdAt, from));
    }
    if (typeof to === 'number' && Number.isSafeInteger(to) && to >= 0) {
      conditions.push(lte(auditLogs.createdAt, to));
    }
    const where = and(...conditions);
    const total = app.db.select({ value: count() }).from(auditLogs).where(where).get()?.value ?? 0;
    const items = app.db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(page.pageSize)
      .offset(page.offset)
      .all();
    return ok(reply, {
      items,
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: Math.ceil(total / page.pageSize),
      },
    });
  });
}
