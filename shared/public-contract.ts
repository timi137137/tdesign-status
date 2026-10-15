/**
 * Public status page wire contract.
 *
 * Shared by the Fastify API (`server/`) and the SPA (`src/`) so the published
 * payload cannot drift between producer and consumer.
 */

export const USER_ROLES = ['administrator', 'publisher', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SERVICE_STATUSES = ['up', 'down', 'maintenance', 'degraded'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const INCIDENT_IMPACTS = ['none', 'minor', 'major', 'critical'] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const PUBLISH_STATES = ['draft', 'published'] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

export type EntityType = 'incident' | 'maintenance';

/**
 * 公开页心跳条的分格口径：通栏是近 24 小时、每格 15 分钟；双列半宽是每天一格。
 * 生产者按它切格，消费者按它标时间轴。
 */
export const HEARTBEAT_BUCKET_MS = 15 * 60 * 1000;
export const DAILY_HEARTBEAT_BUCKET_MS = 24 * 60 * 60 * 1000;
/** 没有数据的格子；渲染成灰，不能画成正常。 */
export const NO_DATA_HEARTBEAT = -1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SiteConfigValue {
  siteName: string;
  title: string;
  description: string;
  locale: string;
  timezone: string;
  logoUrl: string;
  supportUrl: string;
  componentSubtitle: string;
  historySubtitle: string;
  footerText: string;
  adminFooterText: string;
}

export interface PublicService {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  uptime: number;
  heartbeats: number[];
  dailyHeartbeats: number[];
  latency: number;
  lastCheckAt: number;
  enabled: boolean;
  order: number;
  version: number;
}

export interface PublicStatusUpdate {
  id: string;
  at: number;
  status: string;
  body: string;
}

export interface PublicIncident {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  affectedServiceIds: string[];
  updates: PublicStatusUpdate[];
  startedAt: number;
  resolvedAt?: number;
  version: number;
  updatedAt: number;
}

export interface PublicMaintenance {
  id: string;
  title: string;
  description?: string;
  status: MaintenanceStatus;
  scheduledStart: number;
  scheduledEnd: number;
  progress: number;
  affectedServiceIds: string[];
  updates: PublicStatusUpdate[];
  version: number;
  updatedAt: number;
}

export interface OverallStatusSummary {
  status: ServiceStatus;
  title: string;
  message: string;
  upCount: number;
  downCount: number;
  maintenanceCount: number;
  degradedCount: number;
  total: number;
}

export type PublicHistoryEntry =
  | { type: 'incident'; at: number; incident: PublicIncident }
  | { type: 'maintenance'; at: number; maintenance: PublicMaintenance };

export interface PublicSnapshotValue {
  generatedAt: number;
  siteConfig: SiteConfigValue;
  services: PublicService[];
  overall: OverallStatusSummary;
  activeIncidents: PublicIncident[];
  activeMaintenances: PublicMaintenance[];
  recentHistory: PublicHistoryEntry[];
}

/** `public_snapshots` row version is appended by the API on the wire. */
export type PublicSnapshotResponse = PublicSnapshotValue & { version: number };

/**
 * Allowed status progressions. Self-transitions stay legal because edits and
 * appended updates may keep the current status.
 */
export const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  investigating: ['investigating', 'identified', 'monitoring', 'resolved'],
  identified: ['identified', 'monitoring', 'resolved'],
  monitoring: ['monitoring', 'investigating', 'resolved'],
  resolved: ['resolved'],
};

export const MAINTENANCE_STATUS_TRANSITIONS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  scheduled: ['scheduled', 'in_progress', 'completed'],
  in_progress: ['in_progress', 'completed'],
  completed: ['completed'],
};

export function canTransitionIncidentStatus(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionMaintenanceStatus(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return MAINTENANCE_STATUS_TRANSITIONS[from].includes(to);
}
