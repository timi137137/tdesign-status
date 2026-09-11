/** 服务运行状态 */
export type ServiceStatus = 'up' | 'down' | 'maintenance' | 'degraded';

/** 单次心跳：1 正常 / 0 异常 / 2 维护 / 3 降级 */
export type HeartbeatValue = 0 | 1 | 2 | 3;

export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';

export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed';
export type PublicationStatus = 'draft' | 'published' | 'archived';

export interface StatusUpdate {
  id: string;
  at: number;
  status: IncidentStatus | MaintenanceStatus;
  body: string;
}

export interface ServiceMonitor {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  /** 可用率百分比，如 99.95 */
  uptime: number;
  /** 最近 24 小时心跳 */
  heartbeats: HeartbeatValue[];
  /** 按天聚合的状态，公开页双列半宽展示近 60 天 */
  dailyHeartbeats: HeartbeatValue[];
  /** 最近响应时间序列（ms） */
  latencyHistory: number[];
  /** 当前延迟 ms */
  latency: number;
  /** 上次检测时间戳 */
  lastCheckAt: number;
  /** 是否在公开页展示 */
  enabled: boolean;
  /** 公开页排序，越小越靠前 */
  order: number;
  /** true 时允许模拟波动；false 为人工锁定状态 */
  autoSimulate: boolean;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface Incident {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  affectedServiceIds: string[];
  updates: StatusUpdate[];
  startedAt: number;
  resolvedAt?: number;
  publicationStatus?: PublicationStatus;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface Maintenance {
  id: string;
  title: string;
  status: MaintenanceStatus;
  scheduledStart: number;
  scheduledEnd: number;
  progress: number;
  affectedServiceIds: string[];
  updates: StatusUpdate[];
  description?: string;
  publicationStatus?: PublicationStatus;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
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

export interface ServiceUpsertPayload {
  name: string;
  description?: string;
  status: ServiceStatus;
  enabled: boolean;
  autoSimulate: boolean;
  order?: number;
}

export interface IncidentCreatePayload {
  title: string;
  impact: IncidentImpact;
  affectedServiceIds: string[];
  body: string;
}

export interface MaintenanceCreatePayload {
  title: string;
  description?: string;
  scheduledStart: number;
  scheduledEnd: number;
  affectedServiceIds: string[];
  body: string;
}

export interface SiteTextConfig {
  siteName: string;
  headerTitle: string;
  navCurrent: string;
  navHistory: string;
  overallTitles: Record<ServiceStatus, string>;
  overallMessages: Record<ServiceStatus, string>;
  maintenanceTitle: string;
  componentTitle: string;
  componentSubtitle: string;
  incidentTitle: string;
  historyTitle: string;
  historySubtitle: string;
  historyMoreHint: string;
  emptyMaintenance: string;
  emptyIncident: string;
  footerText: string;
  adminFooterText: string;
}

export interface SiteConfig {
  version: number;
  publicationStatus: 'draft' | 'published';
  siteName: string;
  logoUrl?: string;
  faviconUrl?: string;
  timezone: string;
  dateFormat: string;
  themeColor: string;
  sectionOrder: Array<'maintenances' | 'components' | 'incidents' | 'history'>;
  sectionVisibility: Record<'maintenances' | 'components' | 'incidents' | 'history', boolean>;
  maintenancePreviewLimit: number;
  historyPreviewLimit: number;
  text: SiteTextConfig;
  updatedAt: number;
  publishedAt?: number;
}

export interface StatusSnapshot {
  version: number;
  generatedAt: number;
  site: SiteConfig;
  overall: OverallStatusSummary;
  services: ServiceMonitor[];
  incidents: Incident[];
  maintenances: Maintenance[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
