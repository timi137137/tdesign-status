import type { Incident, Maintenance, ServiceMonitor } from '@/types/status';

export const LEGACY_STATUS_KEYS = [
  'status-v6',
  'status-v5',
  'status-v4',
  'status-v3',
  'status-v2',
  'status-v1',
  'status',
] as const;

export interface LegacyStatusPreview {
  key: string;
  serviceCount: number;
  incidentCount: number;
  maintenanceCount: number;
  services: Array<Pick<ServiceMonitor, 'id' | 'name' | 'description' | 'status' | 'enabled'>>;
  incidents: Array<Pick<Incident, 'id' | 'title'>>;
  maintenances: Array<Pick<Maintenance, 'id' | 'title'>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapPersisted(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  if (!root) return null;
  const nested = asRecord(root.status) || asRecord(root.state) || asRecord(root.data);
  if (Array.isArray(root.services) || Array.isArray(root.incidents) || Array.isArray(root.maintenances)) {
    return root;
  }
  if (
    nested &&
    (Array.isArray(nested.services) || Array.isArray(nested.incidents) || Array.isArray(nested.maintenances))
  ) {
    return nested;
  }
  return root;
}

function servicePreview(item: unknown): LegacyStatusPreview['services'][number] | null {
  const record = asRecord(item);
  if (!record || typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  const status =
    record.status === 'down' || record.status === 'maintenance' || record.status === 'degraded' ? record.status : 'up';
  return {
    id: record.id,
    name: record.name,
    description: typeof record.description === 'string' ? record.description : undefined,
    status,
    enabled: record.enabled !== false,
  };
}

function titledPreview(item: unknown): { id: string; title: string } | null {
  const record = asRecord(item);
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string') return null;
  return { id: record.id, title: record.title };
}

export function readLegacyStatusPreview(): LegacyStatusPreview | null {
  if (typeof window === 'undefined') return null;
  for (const key of LEGACY_STATUS_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = unwrapPersisted(JSON.parse(raw));
      if (!parsed) continue;
      const services = Array.isArray(parsed.services)
        ? parsed.services.map(servicePreview).filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];
      const incidents = Array.isArray(parsed.incidents)
        ? parsed.incidents.map(titledPreview).filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];
      const maintenances = Array.isArray(parsed.maintenances)
        ? parsed.maintenances.map(titledPreview).filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];
      if (!services.length && !incidents.length && !maintenances.length) continue;
      return {
        key,
        serviceCount: services.length,
        incidentCount: incidents.length,
        maintenanceCount: maintenances.length,
        services,
        incidents,
        maintenances,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function discardLegacyStatus(keys: readonly string[] = LEGACY_STATUS_KEYS): void {
  if (typeof window === 'undefined') return;
  keys.forEach((key) => window.localStorage.removeItem(key));
}
