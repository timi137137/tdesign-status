import { and, count, desc, eq, isNotNull, isNull, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { incidents, maintenances } from '../db/schema';
import type { PublicHistoryEntry } from '../domain';
import { getCurrentSnapshot } from '../services/snapshot';
import { ApiError, notFound, ok } from '../utils/api';
import { applyPublicCache, contentEtag } from '../utils/cache';
import { pagination } from '../utils/validation';

function parseLimit(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

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
    const page = pagination({
      page: query.page ?? cursorPage ?? 1,
      pageSize: query.pageSize ?? parseLimit(query.limit) ?? 50,
    });
    const requestedType = query.type === 'incident' || query.type === 'maintenance' ? query.type : 'all';

    const incidentWhere = and(
      eq(incidents.publishState, 'published'),
      isNotNull(incidents.publishedJson),
      isNull(incidents.deletedAt),
    );
    const maintenanceWhere = and(
      eq(maintenances.publishState, 'published'),
      isNotNull(maintenances.publishedJson),
      isNull(maintenances.deletedAt),
    );

    // The merged prefix of length N is fully covered by each side's top-N rows,
    // so both reads stay bounded by the requested page instead of the table size.
    const windowSize = page.offset + page.pageSize;
    const incidentRows =
      requestedType === 'maintenance'
        ? []
        : app.db
            .select({ payload: incidents.publishedJson })
            .from(incidents)
            .where(incidentWhere)
            .orderBy(desc(incidents.startedAt))
            .limit(windowSize)
            .all();
    const maintenanceRows =
      requestedType === 'incident'
        ? []
        : app.db
            .select({ payload: maintenances.publishedJson })
            .from(maintenances)
            .where(maintenanceWhere)
            .orderBy(desc(maintenances.scheduledStart))
            .limit(windowSize)
            .all();

    const incidentStats =
      requestedType === 'maintenance'
        ? undefined
        : app.db
            .select({ total: count(), updatedAt: max(incidents.updatedAt) })
            .from(incidents)
            .where(incidentWhere)
            .get();
    const maintenanceStats =
      requestedType === 'incident'
        ? undefined
        : app.db
            .select({ total: count(), updatedAt: max(maintenances.updatedAt) })
            .from(maintenances)
            .where(maintenanceWhere)
            .get();

    const incidentItems = incidentRows.flatMap<PublicHistoryEntry>((row) =>
      row.payload ? [{ type: 'incident', at: row.payload.startedAt, incident: row.payload }] : [],
    );
    const maintenanceItems = maintenanceRows.flatMap<PublicHistoryEntry>((row) =>
      row.payload ? [{ type: 'maintenance', at: row.payload.scheduledStart, maintenance: row.payload }] : [],
    );
    const allItems = [...incidentItems, ...maintenanceItems].sort((left, right) => right.at - left.at);
    const items = allItems.slice(page.offset, page.offset + page.pageSize);

    const total = (incidentStats?.total ?? 0) + (maintenanceStats?.total ?? 0);
    const totalPages = Math.ceil(total / page.pageSize);
    const data = {
      items,
      nextCursor: page.page < totalPages ? String(page.page + 1) : null,
      total,
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages,
      },
    };
    const lastModified = Math.max(incidentStats?.updatedAt ?? 0, maintenanceStats?.updatedAt ?? 0) || Date.now();
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
