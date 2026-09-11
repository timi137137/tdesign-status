import type { UserRole } from '@/types/auth';
import type { Incident, Maintenance, ServiceStatus } from '@/types/status';

import type { AdminPagination } from './admin-status';
import { apiFetch, jsonBody, versionHeaders } from './http';

export interface DashboardCounts {
  services: number;
  enabledServices: number;
  activeIncidents: number;
  scheduledMaintenances: number;
  users: number;
  activeUsers: number;
}

export interface DashboardService {
  id: string;
  slug: string;
  name: string;
  status: ServiceStatus;
  enabled: boolean;
  position: number;
  uptime: number;
  latencyMs: number;
}

export interface DashboardSnapshot {
  etag: string;
  lastModified: number;
  version: number;
}

export interface DashboardAuditItem {
  id: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: number;
}

export interface DashboardOverview {
  counts: DashboardCounts;
  services: DashboardService[];
  activeIncidents: Incident[];
  activeMaintenances: Maintenance[];
  siteConfig: AdminSiteConfig | null;
  snapshot: DashboardSnapshot | null;
  recentAudit: DashboardAuditItem[];
}

export type DashboardWidgetId = 'counts' | 'incidents' | 'maintenances' | 'services' | 'snapshot' | 'audit';

export interface DashboardLayoutConfig {
  widgets: DashboardWidgetId[];
}

export interface DashboardLayoutRow {
  id: string;
  userId: string;
  name: string;
  layoutJson: DashboardLayoutConfig;
  version: number;
}

export interface AdminSiteConfigValue {
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

export interface AdminSiteConfig {
  id: string;
  draftJson: AdminSiteConfigValue;
  publishedJson: AdminSiteConfigValue | null;
  publishedAt: number | null;
  version: number;
  updatedAt: number;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: number | null;
  lastLoginAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdminUserInput {
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  password?: string;
  mustChangePassword?: boolean;
}

export interface AdminAuditLog {
  id: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
  createdAt: number;
}

export interface AdminPage<T> {
  items: T[];
  pagination: AdminPagination;
}

const queryString = (query: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

export const adminApi = {
  dashboard: () => apiFetch<DashboardOverview>('/api/admin/dashboard'),
  layout: {
    get: () => apiFetch<DashboardLayoutRow | null>('/api/admin/dashboard-layout'),
    save: (layout: DashboardLayoutConfig, version?: number) =>
      apiFetch<DashboardLayoutRow>('/api/admin/dashboard-layout', {
        method: 'PUT',
        ...(version === undefined ? {} : versionHeaders(version)),
        ...jsonBody({ name: 'default', layout }),
      }),
  },
  siteConfig: {
    get: () => apiFetch<AdminSiteConfig>('/api/admin/site-config'),
    saveDraft: (version: number, config: AdminSiteConfigValue) =>
      apiFetch<AdminSiteConfig>('/api/admin/site-config/draft', {
        method: 'PUT',
        ...versionHeaders(version),
        ...jsonBody(config),
      }),
    publish: (version: number) =>
      apiFetch<AdminSiteConfig>('/api/admin/site-config/publish', {
        method: 'POST',
        ...versionHeaders(version),
      }),
  },
  users: {
    list: (query?: { page?: number; pageSize?: number }) =>
      apiFetch<AdminPage<AdminUser>>(`/api/admin/users${queryString(query ?? {})}`),
    create: (payload: AdminUserInput) =>
      apiFetch<AdminUser>('/api/admin/users', {
        method: 'POST',
        ...jsonBody(payload),
      }),
    update: (id: string, version: number, payload: Partial<AdminUserInput>) =>
      apiFetch<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        ...versionHeaders(version),
        ...jsonBody(payload),
      }),
    remove: (id: string, version: number) =>
      apiFetch<{ id: string; version: number }>(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        ...versionHeaders(version),
      }),
  },
  audit: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      action?: string;
      entityType?: string;
      from?: number;
      to?: number;
    }) => apiFetch<AdminPage<AdminAuditLog>>(`/api/admin/audit${queryString(query ?? {})}`),
  },
};
