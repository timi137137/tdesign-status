import type {
  OverallStatusSummary,
  PublicHistoryEntry,
  PublicIncident,
  PublicMaintenance,
  PublicService,
  PublicSnapshotResponse,
  ServiceStatus,
  SiteConfigValue,
} from '@shared/public-contract';
import { NO_DATA_HEARTBEAT } from '@shared/public-contract';

import { DEFAULT_SITE_CONFIG } from '@/constants/site';
import type { HeartbeatValue, Incident, Maintenance, ServiceMonitor, SiteConfig, StatusSnapshot } from '@/types/status';

/**
 * Deep-optional view of the shared wire contract: the service worker may replay
 * a snapshot cached by an older build, so every field has to be tolerated.
 */
type DeepPartial<T> = T extends (infer U)[]
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PublicSnapshotPayload = DeepPartial<PublicSnapshotResponse>;

const HEARTBEAT_VALUES = new Set<HeartbeatValue>([NO_DATA_HEARTBEAT, 0, 1, 2, 3]);

function toHeartbeats(values: unknown): HeartbeatValue[] {
  if (!Array.isArray(values)) return [];
  // 认不出的取值按"无数据"处理：宁可画灰，也不能画成正常。
  return (values as unknown[]).map((value) =>
    HEARTBEAT_VALUES.has(value as HeartbeatValue) ? (value as HeartbeatValue) : NO_DATA_HEARTBEAT,
  );
}

function mergeById<T extends { id: string }>(...lists: Array<Array<T | undefined> | undefined>): T[] {
  const map = new Map<string, T>();
  lists.forEach((list) => {
    (list || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
  });
  return [...map.values()];
}

export function mapPublicSiteConfig(raw?: DeepPartial<SiteConfigValue>, fallback?: SiteConfig): SiteConfig {
  const base = fallback || DEFAULT_SITE_CONFIG;
  const siteName = raw?.siteName?.trim() || base.siteName;
  const title = raw?.title?.trim() || base.text.headerTitle;
  return {
    ...base,
    siteName,
    timezone: raw?.timezone?.trim() || base.timezone,
    logoUrl: raw?.logoUrl?.trim() || base.logoUrl,
    text: {
      ...base.text,
      siteName,
      headerTitle: title,
      componentSubtitle: raw?.componentSubtitle?.trim() || base.text.componentSubtitle,
      historySubtitle: raw?.historySubtitle?.trim() || base.text.historySubtitle,
      footerText: raw?.footerText?.trim() || base.text.footerText,
      adminFooterText: raw?.adminFooterText?.trim() || base.text.adminFooterText,
    },
  };
}

export function mapPublicService(item: DeepPartial<PublicService> & { id: string; name: string }): ServiceMonitor {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: (item.status ?? 'up') as ServiceStatus,
    uptime: item.uptime ?? 100,
    heartbeats: toHeartbeats(item.heartbeats),
    dailyHeartbeats: toHeartbeats(item.dailyHeartbeats),
    latency: item.latency ?? 0,
    lastCheckAt: item.lastCheckAt ?? 0,
    enabled: item.enabled !== false,
    order: item.order ?? 0,
    autoSimulate: false,
    version: item.version,
  };
}

function emptyOverall(): OverallStatusSummary {
  return {
    status: 'up',
    title: DEFAULT_SITE_CONFIG.text.overallTitles.up,
    message: DEFAULT_SITE_CONFIG.text.overallMessages.up,
    upCount: 0,
    downCount: 0,
    maintenanceCount: 0,
    degradedCount: 0,
    total: 0,
  };
}

export function mapPublicSnapshot(raw: PublicSnapshotPayload): StatusSnapshot {
  const recentIncidents = (raw.recentHistory || [])
    .filter(
      (item): item is DeepPartial<PublicHistoryEntry> & { incident: PublicIncident } =>
        item?.type === 'incident' && Boolean(item.incident),
    )
    .map((item) => item.incident as Incident);
  const recentMaintenances = (raw.recentHistory || [])
    .filter(
      (item): item is DeepPartial<PublicHistoryEntry> & { maintenance: PublicMaintenance } =>
        item?.type === 'maintenance' && Boolean(item.maintenance),
    )
    .map((item) => item.maintenance as Maintenance);

  return {
    version: raw.version ?? 0,
    generatedAt: raw.generatedAt || Date.now(),
    site: mapPublicSiteConfig(raw.siteConfig),
    overall: (raw.overall as OverallStatusSummary) || emptyOverall(),
    services: (raw.services || []).map((item) => mapPublicService(item as PublicService)),
    incidents: mergeById(raw.activeIncidents as Incident[], recentIncidents),
    maintenances: mergeById(raw.activeMaintenances as Maintenance[], recentMaintenances),
  };
}
