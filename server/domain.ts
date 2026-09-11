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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

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

export interface SessionPrincipal {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  userVersion: number;
  sessionId: string;
  sessionTokenHash: string;
}

export interface PublicService {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  uptime: number;
  heartbeats: number[];
  dailyHeartbeats: number[];
  latencyHistory: number[];
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

export interface PublicSnapshotValue {
  generatedAt: number;
  siteConfig: SiteConfigValue;
  services: PublicService[];
  overall: OverallStatusSummary;
  activeIncidents: PublicIncident[];
  activeMaintenances: PublicMaintenance[];
  recentHistory: Array<{
    type: EntityType;
    at: number;
    incident?: PublicIncident;
    maintenance?: PublicMaintenance;
  }>;
}

export function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
