import type { CursorPage, Incident, Maintenance, StatusSnapshot } from '@/types/status';
import { mapPublicSnapshot, type PublicSnapshotPayload } from '@/utils/public-snapshot';

import { apiFetch } from './http';

export type HistoryEntry =
  | { type: 'incident'; at: number; incident: Incident }
  | { type: 'maintenance'; at: number; maintenance: Maintenance };

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
};

export const publicStatusApi = {
  snapshot: async () => {
    const payload = await apiFetch<PublicSnapshotPayload>('/api/public/snapshot');
    return mapPublicSnapshot(payload) as StatusSnapshot;
  },
  history: (cursor?: string, limit = 50) =>
    apiFetch<CursorPage<HistoryEntry>>(`/api/public/history${queryString({ cursor: cursor || '1', limit })}`),
  incident: (id: string) => apiFetch<Incident>(`/api/public/incident/${encodeURIComponent(id)}`),
  maintenance: (id: string) => apiFetch<Maintenance>(`/api/public/maintenance/${encodeURIComponent(id)}`),
};
