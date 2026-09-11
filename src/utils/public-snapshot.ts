import { DEFAULT_SITE_CONFIG } from '@/constants/site';
import type {
  HeartbeatValue,
  Incident,
  Maintenance,
  OverallStatusSummary,
  ServiceMonitor,
  ServiceStatus,
  SiteConfig,
  StatusSnapshot,
} from '@/types/status';

export interface PublicSiteConfigPayload {
  siteName?: string;
  title?: string;
  description?: string;
  locale?: string;
  timezone?: string;
  logoUrl?: string;
  supportUrl?: string;
  componentSubtitle?: string;
  historySubtitle?: string;
  footerText?: string;
  adminFooterText?: string;
}

export interface PublicServicePayload {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  uptime?: number;
  heartbeats?: number[];
  dailyHeartbeats?: number[];
  latencyHistory?: number[];
  latency?: number;
  latencyMs?: number;
  lastCheckAt?: number;
  enabled?: boolean;
  order?: number;
  position?: number;
  version?: number;
  updatedAt?: number;
}

export interface PublicHistoryItemPayload {
  type: 'incident' | 'maintenance';
  at: number;
  incident?: Incident;
  maintenance?: Maintenance;
}

export interface PublicSnapshotPayload {
  generatedAt?: number;
  version?: number;
  siteConfig?: PublicSiteConfigPayload;
  site?: SiteConfig;
  services?: PublicServicePayload[];
  overall?: OverallStatusSummary;
  activeIncidents?: Incident[];
  activeMaintenances?: Maintenance[];
  recentHistory?: PublicHistoryItemPayload[];
  incidents?: Incident[];
  maintenances?: Maintenance[];
}

const HEARTBEAT_VALUES = new Set<HeartbeatValue>([0, 1, 2, 3]);

function toHeartbeats(values: unknown): HeartbeatValue[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => (HEARTBEAT_VALUES.has(value as HeartbeatValue) ? (value as HeartbeatValue) : 1));
}

function mergeById<T extends { id: string }>(...lists: Array<T[] | undefined>): T[] {
  const map = new Map<string, T>();
  lists.forEach((list) => {
    (list || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
  });
  return [...map.values()];
}

export function mapPublicSiteConfig(raw?: PublicSiteConfigPayload, fallback?: SiteConfig): SiteConfig {
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

export function mapPublicService(item: PublicServicePayload): ServiceMonitor {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status,
    uptime: item.uptime ?? 100,
    heartbeats: toHeartbeats(item.heartbeats),
    dailyHeartbeats: toHeartbeats(item.dailyHeartbeats),
    latencyHistory: Array.isArray(item.latencyHistory) ? item.latencyHistory : [],
    latency: item.latency ?? item.latencyMs ?? 0,
    lastCheckAt: item.lastCheckAt ?? 0,
    enabled: item.enabled !== false,
    order: item.order ?? item.position ?? 0,
    autoSimulate: false,
    version: item.version,
    updatedAt: item.updatedAt,
  };
}

export function mapPublicSnapshot(raw: PublicSnapshotPayload): StatusSnapshot {
  const recentIncidents = (raw.recentHistory || [])
    .filter((item) => item.type === 'incident' && item.incident)
    .map((item) => item.incident as Incident);
  const recentMaintenances = (raw.recentHistory || [])
    .filter((item) => item.type === 'maintenance' && item.maintenance)
    .map((item) => item.maintenance as Maintenance);

  return {
    version: raw.version ?? 0,
    generatedAt: raw.generatedAt || Date.now(),
    site: raw.site || mapPublicSiteConfig(raw.siteConfig),
    overall: raw.overall || {
      status: 'up',
      title: DEFAULT_SITE_CONFIG.text.overallTitles.up,
      message: DEFAULT_SITE_CONFIG.text.overallMessages.up,
      upCount: 0,
      downCount: 0,
      maintenanceCount: 0,
      degradedCount: 0,
      total: 0,
    },
    services: (raw.services || []).map(mapPublicService),
    incidents: mergeById(raw.incidents, raw.activeIncidents, recentIncidents),
    maintenances: mergeById(raw.maintenances, raw.activeMaintenances, recentMaintenances),
  };
}
