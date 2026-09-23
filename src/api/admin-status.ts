import type {
  Incident,
  IncidentCreatePayload,
  IncidentImpact,
  IncidentStatus,
  Maintenance,
  MaintenanceCreatePayload,
  MaintenanceStatus,
  PublicationStatus,
  ServiceStatus,
} from '@/types/status';

import { apiFetch, jsonBody } from './http';

type QueryValue = string | number | boolean | Array<string | number> | undefined;
type PublishState = Exclude<PublicationStatus, 'archived'>;

export interface AdminListQuery {
  cursor?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  status?: string;
  impact?: IncidentImpact;
  publishState?: PublishState;
  enabled?: boolean;
  serviceId?: string;
  filter?: Record<string, QueryValue>;
}

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminPage<T> {
  items: T[];
  pagination?: AdminPagination;
  nextCursor?: string | null;
  total?: number;
}

export interface AdminService {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: ServiceStatus;
  enabled: boolean;
  position: number;
  uptime: number;
  latencyMs: number;
  lastCheckAt: number;
  version: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface AdminServiceInput {
  slug: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  enabled: boolean;
  position?: number;
  uptime?: number;
  latencyMs?: number;
}

export interface AdminIncident extends Incident {
  publishState: PublishState;
  publishedAt?: number | null;
  version: number;
}

export interface AdminMaintenance extends Maintenance {
  publishState: PublishState;
  publishedAt?: number | null;
  version: number;
}

export interface IncidentUpdatePayload {
  title?: string;
  impact?: IncidentImpact;
  status?: IncidentStatus;
  affectedServiceIds?: string[];
  startedAt?: number;
  resolvedAt?: number;
}

export interface IncidentTimelinePayload {
  status: IncidentStatus;
  body: string;
  occurredAt?: number;
}

export interface MaintenanceUpdatePayload {
  title?: string;
  description?: string;
  status?: MaintenanceStatus;
  scheduledStart?: number;
  scheduledEnd?: number;
  progress?: number;
  affectedServiceIds?: string[];
}

export interface MaintenanceTimelinePayload {
  status: MaintenanceStatus;
  progress?: number;
  body: string;
  occurredAt?: number;
}

export interface ServiceReferenceSummary {
  incidentCount: number;
  maintenanceCount: number;
  incidentTitles: string[];
  maintenanceTitles: string[];
}

const appendQuery = (params: URLSearchParams, values: Record<string, QueryValue>) => {
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    params.set(key, String(value));
  });
};

const queryString = (query?: AdminListQuery) => {
  if (!query) return '';
  const { filter, ...values } = query;
  const params = new URLSearchParams();
  appendQuery(params, values);
  appendQuery(params, filter ?? {});
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

const entityPath = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

const versionHeaders = (version: number): Pick<RequestInit, 'headers'> => ({
  headers: { 'If-Match': `"${version}"` },
});

const versionedJson = (method: string, version: number, payload?: unknown): RequestInit => ({
  method,
  ...versionHeaders(version),
  ...(payload === undefined ? {} : jsonBody(payload)),
});

const listServices = (query?: AdminListQuery) =>
  apiFetch<AdminPage<AdminService>>(`/api/admin/services${queryString(query)}`);

const listIncidents = (query?: AdminListQuery) =>
  apiFetch<AdminPage<AdminIncident>>(`/api/admin/incidents${queryString(query)}`);

const listMaintenances = (query?: AdminListQuery) =>
  apiFetch<AdminPage<AdminMaintenance>>(`/api/admin/maintenances${queryString(query)}`);

async function collectAll<T>(
  loader: (page: number) => Promise<AdminPage<T>>,
  page = 1,
  previousItems: T[] = [],
): Promise<T[]> {
  const result = await loader(page);
  const items = [...previousItems, ...result.items];
  const totalPages = result.pagination?.totalPages ?? 1;
  return page < totalPages ? collectAll(loader, page + 1, items) : items;
}

const serviceReferences = async (serviceId: string): Promise<ServiceReferenceSummary> => {
  const [incidents, maintenances] = await Promise.all([
    collectAll((page) => listIncidents({ page, pageSize: 100, serviceId })),
    collectAll((page) => listMaintenances({ page, pageSize: 100, serviceId })),
  ]);
  const relatedIncidents = incidents.filter((item) => item.affectedServiceIds.includes(serviceId));
  const relatedMaintenances = maintenances.filter((item) => item.affectedServiceIds.includes(serviceId));
  return {
    incidentCount: relatedIncidents.length,
    maintenanceCount: relatedMaintenances.length,
    incidentTitles: relatedIncidents.slice(0, 3).map((item) => item.title),
    maintenanceTitles: relatedMaintenances.slice(0, 3).map((item) => item.title),
  };
};

export const adminStatusApi = {
  services: {
    list: listServices,
    get: (id: string) => apiFetch<AdminService>(entityPath('/api/admin/services', id)),
    create: (payload: AdminServiceInput) =>
      apiFetch<AdminService>('/api/admin/services', {
        method: 'POST',
        ...jsonBody(payload),
      }),
    update: (id: string, version: number, payload: Partial<AdminServiceInput>) =>
      apiFetch<AdminService>(entityPath('/api/admin/services', id), versionedJson('PUT', version, payload)),
    remove: (id: string, version: number) =>
      apiFetch<{ id: string; version: number }>(
        entityPath('/api/admin/services', id),
        versionedJson('DELETE', version),
      ),
    reorder: (items: Array<{ id: string; version: number; position: number }>) =>
      apiFetch<{ items: AdminService[] }>('/api/admin/services/reorder', {
        method: 'POST',
        ...jsonBody({ items }),
      }),
    references: serviceReferences,
  },
  incidents: {
    list: listIncidents,
    get: (id: string) => apiFetch<AdminIncident>(entityPath('/api/admin/incidents', id)),
    create: (payload: IncidentCreatePayload & { startedAt?: number }) =>
      apiFetch<AdminIncident>('/api/admin/incidents', {
        method: 'POST',
        ...jsonBody(payload),
      }),
    update: (id: string, version: number, payload: IncidentUpdatePayload) =>
      apiFetch<AdminIncident>(entityPath('/api/admin/incidents', id), versionedJson('PUT', version, payload)),
    appendUpdate: (id: string, version: number, payload: IncidentTimelinePayload) =>
      apiFetch<AdminIncident>(
        `${entityPath('/api/admin/incidents', id)}/updates`,
        versionedJson('POST', version, payload),
      ),
    publish: (id: string, version: number) =>
      apiFetch<AdminIncident>(`${entityPath('/api/admin/incidents', id)}/publish`, versionedJson('POST', version)),
    resolve: (id: string, version: number, body: string, occurredAt?: number) =>
      apiFetch<AdminIncident>(
        `${entityPath('/api/admin/incidents', id)}/updates`,
        versionedJson('POST', version, {
          status: 'resolved',
          body,
          occurredAt,
        }),
      ),
    remove: (id: string, version: number) =>
      apiFetch<{ id: string; version: number }>(
        entityPath('/api/admin/incidents', id),
        versionedJson('DELETE', version),
      ),
  },
  maintenances: {
    list: listMaintenances,
    get: (id: string) => apiFetch<AdminMaintenance>(entityPath('/api/admin/maintenances', id)),
    create: (payload: MaintenanceCreatePayload) =>
      apiFetch<AdminMaintenance>('/api/admin/maintenances', {
        method: 'POST',
        ...jsonBody(payload),
      }),
    update: (id: string, version: number, payload: MaintenanceUpdatePayload) =>
      apiFetch<AdminMaintenance>(entityPath('/api/admin/maintenances', id), versionedJson('PUT', version, payload)),
    appendUpdate: (id: string, version: number, payload: MaintenanceTimelinePayload) =>
      apiFetch<AdminMaintenance>(
        `${entityPath('/api/admin/maintenances', id)}/updates`,
        versionedJson('POST', version, payload),
      ),
    publish: (id: string, version: number) =>
      apiFetch<AdminMaintenance>(
        `${entityPath('/api/admin/maintenances', id)}/publish`,
        versionedJson('POST', version),
      ),
    complete: (id: string, version: number, body: string, occurredAt?: number) =>
      apiFetch<AdminMaintenance>(
        `${entityPath('/api/admin/maintenances', id)}/updates`,
        versionedJson('POST', version, {
          status: 'completed',
          progress: 100,
          body,
          occurredAt,
        }),
      ),
    remove: (id: string, version: number) =>
      apiFetch<{ id: string; version: number }>(
        entityPath('/api/admin/maintenances', id),
        versionedJson('DELETE', version),
      ),
  },
};
