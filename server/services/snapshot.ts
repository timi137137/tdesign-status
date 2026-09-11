import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type {
  OverallStatusSummary,
  PublicIncident,
  PublicMaintenance,
  PublicService,
  PublicSnapshotValue,
  SiteConfigValue,
} from '../domain';
import type { AppDatabase } from '../db/client';
import {
  entityServices,
  incidents,
  incidentUpdates,
  maintenances,
  maintenanceUpdates,
  publicSnapshots,
  serviceSamples,
  services,
  siteConfigs,
  type IncidentRow,
  type MaintenanceRow,
} from '../db/schema';
import { contentEtag } from '../utils/cache';

export const DEFAULT_SITE_CONFIG: SiteConfigValue = {
  siteName: '腾讯服务状态',
  title: '腾讯服务运行状态',
  description: '查看腾讯产品与云服务的实时运行状态、事件和维护计划。',
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  logoUrl: '',
  supportUrl: '',
  componentSubtitle: '通栏为近 24 小时探测；双列半宽为近 30 日状态。',
  historySubtitle: '按开始时间倒序。完整进展请打开详情。',
  footerText: '腾讯服务状态',
  adminFooterText: `Copyright © 2021-${new Date().getFullYear()} Tencent. All Rights Reserved`,
};

function summarize(items: PublicService[]): OverallStatusSummary {
  const total = items.length;
  const downCount = items.filter((item) => item.status === 'down').length;
  const maintenanceCount = items.filter((item) => item.status === 'maintenance').length;
  const degradedCount = items.filter((item) => item.status === 'degraded').length;
  const upCount = items.filter((item) => item.status === 'up').length;

  if (downCount > 0) {
    return {
      status: 'down',
      title: '部分服务异常',
      message: `Partial System Outage — ${downCount} 个服务不可用`,
      upCount,
      downCount,
      maintenanceCount,
      degradedCount,
      total,
    };
  }
  if (degradedCount > 0) {
    return {
      status: 'degraded',
      title: '性能降级',
      message: `Degraded Performance — ${degradedCount} 个服务响应变慢`,
      upCount,
      downCount,
      maintenanceCount,
      degradedCount,
      total,
    };
  }
  if (maintenanceCount > 0) {
    return {
      status: 'maintenance',
      title: '部分维护中',
      message: `Under Maintenance — ${maintenanceCount} 个服务维护中`,
      upCount,
      downCount,
      maintenanceCount,
      degradedCount,
      total,
    };
  }
  return {
    status: 'up',
    title: '所有服务正常',
    message: 'All Systems Operational',
    upCount,
    downCount,
    maintenanceCount,
    degradedCount,
    total,
  };
}

function affectedServiceIds(
  db: AppDatabase,
  entityType: 'incident' | 'maintenance',
  entityId: string,
): string[] {
  return db
    .select({ serviceId: entityServices.serviceId })
    .from(entityServices)
    .where(
      and(
        eq(entityServices.entityType, entityType),
        eq(entityServices.entityId, entityId),
        isNull(entityServices.deletedAt),
      ),
    )
    .all()
    .map((item) => item.serviceId);
}

export function materializeIncident(
  db: AppDatabase,
  incident: IncidentRow,
): PublicIncident {
  const updates = db
    .select()
    .from(incidentUpdates)
    .where(
      and(
        eq(incidentUpdates.incidentId, incident.id),
        isNull(incidentUpdates.deletedAt),
      ),
    )
    .orderBy(asc(incidentUpdates.occurredAt))
    .all();
  return {
    id: incident.id,
    title: incident.title,
    impact: incident.impact,
    status: incident.status,
    affectedServiceIds: affectedServiceIds(db, 'incident', incident.id),
    updates: updates.map((update) => ({
      id: update.id,
      at: update.occurredAt,
      status: update.status,
      body: update.body,
    })),
    startedAt: incident.startedAt,
    ...(incident.resolvedAt ? { resolvedAt: incident.resolvedAt } : {}),
    version: incident.version,
    updatedAt: incident.updatedAt,
  };
}

export function materializeMaintenance(
  db: AppDatabase,
  maintenance: MaintenanceRow,
): PublicMaintenance {
  const updates = db
    .select()
    .from(maintenanceUpdates)
    .where(
      and(
        eq(maintenanceUpdates.maintenanceId, maintenance.id),
        isNull(maintenanceUpdates.deletedAt),
      ),
    )
    .orderBy(asc(maintenanceUpdates.occurredAt))
    .all();
  return {
    id: maintenance.id,
    title: maintenance.title,
    ...(maintenance.description ? { description: maintenance.description } : {}),
    status: maintenance.status,
    scheduledStart: maintenance.scheduledStart,
    scheduledEnd: maintenance.scheduledEnd,
    progress: maintenance.progress,
    affectedServiceIds: affectedServiceIds(db, 'maintenance', maintenance.id),
    updates: updates.map((update) => ({
      id: update.id,
      at: update.occurredAt,
      status: update.status,
      body: update.body,
    })),
    version: maintenance.version,
    updatedAt: maintenance.updatedAt,
  };
}

function buildServices(db: AppDatabase): PublicService[] {
  const rows = db
    .select()
    .from(services)
    .where(and(eq(services.enabled, true), isNull(services.deletedAt)))
    .orderBy(asc(services.position))
    .all();
  if (rows.length === 0) return [];

  const samples = db
    .select()
    .from(serviceSamples)
    .where(isNull(serviceSamples.deletedAt))
    .orderBy(asc(serviceSamples.observedAt))
    .all();
  const grouped = new Map<string, typeof samples>();
  for (const sample of samples) {
    const values = grouped.get(sample.serviceId) ?? [];
    values.push(sample);
    grouped.set(sample.serviceId, values);
  }

  return rows.map((service) => {
    const values = (grouped.get(service.id) ?? []).slice(-90);
    const heartbeats = values.map((item) => item.heartbeatValue);
    const latencyHistory = values.slice(-48).map((item) => item.latencyMs);
    return {
      id: service.id,
      name: service.name,
      ...(service.description ? { description: service.description } : {}),
      status: service.status,
      uptime: service.uptime,
      heartbeats,
      dailyHeartbeats: heartbeats.slice(-60),
      latencyHistory,
      latency: service.latencyMs,
      lastCheckAt: service.lastCheckAt,
      enabled: service.enabled,
      order: service.position,
      version: service.version,
    };
  });
}

function publishedIncidents(db: AppDatabase): PublicIncident[] {
  return db
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
    .flatMap((row) => (row.payload ? [row.payload] : []));
}

function publishedMaintenances(db: AppDatabase): PublicMaintenance[] {
  return db
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
    .flatMap((row) => (row.payload ? [row.payload] : []));
}

export function buildSnapshot(db: AppDatabase): PublicSnapshotValue {
  const config = db
    .select()
    .from(siteConfigs)
    .where(and(eq(siteConfigs.id, 'default'), isNull(siteConfigs.deletedAt)))
    .get();
  const serviceItems = buildServices(db);
  const incidentItems = publishedIncidents(db);
  const maintenanceItems = publishedMaintenances(db);
  const history = [
    ...incidentItems.map((incident) => ({
      type: 'incident' as const,
      at: incident.startedAt,
      incident,
    })),
    ...maintenanceItems.map((maintenance) => ({
      type: 'maintenance' as const,
      at: maintenance.scheduledStart,
      maintenance,
    })),
  ]
    .sort((left, right) => right.at - left.at)
    .slice(0, 5);

  return {
    generatedAt: Date.now(),
    siteConfig: config?.publishedJson ?? config?.draftJson ?? DEFAULT_SITE_CONFIG,
    services: serviceItems,
    overall: summarize(serviceItems),
    activeIncidents: incidentItems.filter((item) => item.status !== 'resolved'),
    activeMaintenances: maintenanceItems
      .filter((item) => item.status !== 'completed')
      .sort((left, right) => left.scheduledStart - right.scheduledStart),
    recentHistory: history,
  };
}

export function rebuildPublicSnapshot(db: AppDatabase, actorUserId?: string): {
  etag: string;
  lastModified: number;
  version: number;
} {
  const payload = buildSnapshot(db);
  const etag = contentEtag(payload);
  const now = payload.generatedAt;
  const current = db
    .select()
    .from(publicSnapshots)
    .where(eq(publicSnapshots.id, 'current'))
    .get();

  if (!current) {
    db.insert(publicSnapshots)
      .values({
        id: 'current',
        payloadJson: payload,
        etag,
        lastModified: now,
        createdAt: now,
        updatedAt: now,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      })
      .run();
    return { etag, lastModified: now, version: 1 };
  }

  db.update(publicSnapshots)
    .set({
      payloadJson: payload,
      etag,
      lastModified: now,
      updatedAt: now,
      updatedBy: actorUserId,
      deletedAt: null,
      deletedBy: null,
      version: sql`${publicSnapshots.version} + 1`,
    })
    .where(eq(publicSnapshots.id, 'current'))
    .run();
  return { etag, lastModified: now, version: current.version + 1 };
}

export function getCurrentSnapshot(db: AppDatabase) {
  return db
    .select()
    .from(publicSnapshots)
    .where(and(eq(publicSnapshots.id, 'current'), isNull(publicSnapshots.deletedAt)))
    .get();
}
