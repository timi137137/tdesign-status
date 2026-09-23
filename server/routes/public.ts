import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { incidents, maintenances } from '../db/schema';
import { getCurrentSnapshot } from '../services/snapshot';
import { ApiError, notFound, ok } from '../utils/api';
import { applyPublicCache, contentEtag } from '../utils/cache';
import { pagination } from '../utils/validation';

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/public/snapshot', async (request, reply) => {
    const snapshot = getCurrentSnapshot(app.db);
    if (!snapshot) {
      throw new ApiError(503, 'SNAPSHOT_UNAVAILABLE', '公开快照尚未生成，请先执行显式 seed 或发布内容');
    }
    if (applyPublicCache(request, reply, snapshot.etag, snapshot.lastModified, app.appConfig.publicCacheSeconds)) {
      return reply;
    }
    return ok(reply, {
      ...snapshot.payloadJson,
      version: snapshot.version,
    });
  });

  app.get('/api/public/history', async (request, reply) => {
    const query = request.query && typeof request.query === 'object' ? (request.query as Record<string, unknown>) : {};
    const cursorPage =
      typeof query.cursor === 'string' && /^\d+$/.test(query.cursor) ? Number(query.cursor) : undefined;
    const limit =
      typeof query.limit === 'string' ? Number(query.limit) : typeof query.limit === 'number' ? query.limit : undefined;
    const page = pagination({
      page: query.page ?? cursorPage ?? 1,
      pageSize: query.pageSize ?? limit ?? 50,
    });
    const requestedType = query.type === 'incident' || query.type === 'maintenance' ? query.type : 'all';
    const incidentItems =
      requestedType === 'maintenance'
        ? []
        : app.db
            .select({ payload: incidents.publishedJson })
            .from(incidents)
            .where(
              and(
                eq(incidents.publishState, 'published'),
                isNotNull(incidents.publishedJson),
                isNull(incidents.deletedAt),
              ),
            )
            .orderBy(desc(incidents.startedAt))
            .all()
            .flatMap((row) =>
              row.payload
                ? [
                    {
                      type: 'incident' as const,
                      at: row.payload.startedAt,
                      incident: row.payload,
                    },
                  ]
                : [],
            );
    const maintenanceItems =
      requestedType === 'incident'
        ? []
        : app.db
            .select({ payload: maintenances.publishedJson })
            .from(maintenances)
            .where(
              and(
                eq(maintenances.publishState, 'published'),
                isNotNull(maintenances.publishedJson),
                isNull(maintenances.deletedAt),
              ),
            )
            .orderBy(desc(maintenances.scheduledStart))
            .all()
            .flatMap((row) =>
              row.payload
                ? [
                    {
                      type: 'maintenance' as const,
                      at: row.payload.scheduledStart,
                      maintenance: row.payload,
                    },
                  ]
                : [],
            );
    const allItems = [...incidentItems, ...maintenanceItems].sort((left, right) => right.at - left.at);
    const items = allItems.slice(page.offset, page.offset + page.pageSize);
    const totalPages = Math.ceil(allItems.length / page.pageSize) || 0;
    const data = {
      items,
      nextCursor: page.page < totalPages ? String(page.page + 1) : null,
      total: allItems.length,
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: allItems.length,
        totalPages,
      },
    };
    const lastModified =
      allItems.reduce(
        (latest, item) =>
          Math.max(latest, item.type === 'incident' ? item.incident.updatedAt : item.maintenance.updatedAt),
        0,
      ) || Date.now();
    const etag = contentEtag(data);
    if (applyPublicCache(request, reply, etag, lastModified, app.appConfig.publicCacheSeconds)) {
      return reply;
    }
    return ok(reply, data);
  });

  app.get<{ Params: { id: string } }>('/api/public/incident/:id', async (request, reply) => {
    const row = app.db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.id, request.params.id),
          eq(incidents.publishState, 'published'),
          isNotNull(incidents.publishedJson),
          isNull(incidents.deletedAt),
        ),
      )
      .get();
    if (!row?.publishedJson) return notFound('事件不存在或尚未发布');
    const etag = contentEtag(row.publishedJson);
    if (applyPublicCache(request, reply, etag, row.publishedJson.updatedAt, app.appConfig.publicCacheSeconds)) {
      return reply;
    }
    return ok(reply, row.publishedJson);
  });

  app.get<{ Params: { id: string } }>('/api/public/maintenance/:id', async (request, reply) => {
    const row = app.db
      .select()
      .from(maintenances)
      .where(
        and(
          eq(maintenances.id, request.params.id),
          eq(maintenances.publishState, 'published'),
          isNotNull(maintenances.publishedJson),
          isNull(maintenances.deletedAt),
        ),
      )
      .get();
    if (!row?.publishedJson) return notFound('维护不存在或尚未发布');
    const etag = contentEtag(row.publishedJson);
    if (applyPublicCache(request, reply, etag, row.publishedJson.updatedAt, app.appConfig.publicCacheSeconds)) {
      return reply;
    }
    return ok(reply, row.publishedJson);
  });
}
