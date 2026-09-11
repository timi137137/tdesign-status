import { defineStore } from 'pinia';

import { publicStatusApi } from '@/api/status';
import { DEFAULT_SITE_CONFIG } from '@/constants/site';
import type { Incident, Maintenance, OverallStatusSummary, ServiceMonitor, StatusSnapshot } from '@/types/status';
import { detectOffline } from '@/utils/network';

const POLL_INTERVAL = 30_000;
const SYNC_CHANNEL = 'tdesign-status-public-v1';

type HistoryEntry =
  | { type: 'incident'; at: number; incident: Incident }
  | { type: 'maintenance'; at: number; maintenance: Maintenance };

const emptyOverall = (): OverallStatusSummary => ({
  status: 'up',
  title: DEFAULT_SITE_CONFIG.text.overallTitles.up,
  message: DEFAULT_SITE_CONFIG.text.overallMessages.up,
  upCount: 0,
  downCount: 0,
  maintenanceCount: 0,
  degradedCount: 0,
  total: 0,
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let channel: BroadcastChannel | null = null;
let syncInstalled = false;

export const useStatusStore = defineStore('status', {
  state: () => ({
    siteConfig: { ...DEFAULT_SITE_CONFIG },
    services: [] as ServiceMonitor[],
    incidents: [] as Incident[],
    maintenances: [] as Maintenance[],
    overallSummary: emptyOverall(),
    snapshotVersion: 0,
    fetchedAt: 0,
    loading: false,
    stale: false,
    offline: typeof navigator !== 'undefined' && !navigator.onLine,
    error: '',
  }),
  getters: {
    visibleServices(state): ServiceMonitor[] {
      return state.services.filter((item) => item.enabled).sort((a, b) => a.order - b.order);
    },
    serviceNameMap(state): Record<string, string> {
      return Object.fromEntries(state.services.map((item) => [item.id, item.name]));
    },
    overall(state): OverallStatusSummary {
      return state.overallSummary;
    },
    activeIncidents(state): Incident[] {
      return state.incidents.filter((item) => item.status !== 'resolved').sort((a, b) => b.startedAt - a.startedAt);
    },
    incidentHistory(state): Incident[] {
      return [...state.incidents].sort((a, b) => b.startedAt - a.startedAt);
    },
    activeMaintenances(state): Maintenance[] {
      return state.maintenances
        .filter((item) => item.status !== 'completed')
        .sort((a, b) => a.scheduledStart - b.scheduledStart);
    },
    maintenanceHistory(state): Maintenance[] {
      return [...state.maintenances].sort((a, b) => b.scheduledStart - a.scheduledStart);
    },
    historyFeed(state): HistoryEntry[] {
      const incidents: HistoryEntry[] = state.incidents.map((incident) => ({
        type: 'incident',
        at: incident.startedAt,
        incident,
      }));
      const maintenances: HistoryEntry[] = state.maintenances.map((maintenance) => ({
        type: 'maintenance',
        at: maintenance.scheduledStart,
        maintenance,
      }));
      return [...incidents, ...maintenances].sort((a, b) => b.at - a.at);
    },
  },
  actions: {
    applySnapshot(snapshot: StatusSnapshot) {
      this.siteConfig = snapshot.site || { ...DEFAULT_SITE_CONFIG };
      this.services = snapshot.services || [];
      this.incidents = snapshot.incidents || [];
      this.maintenances = snapshot.maintenances || [];
      this.overallSummary = snapshot.overall || emptyOverall();
      this.snapshotVersion = snapshot.version;
      this.fetchedAt = snapshot.generatedAt || Date.now();
      this.stale = false;
      this.error = '';
    },
    async loadSnapshot(force = false) {
      if (this.loading || (!force && this.fetchedAt && Date.now() - this.fetchedAt < 5_000)) return;
      this.loading = true;
      try {
        const snapshot = await publicStatusApi.snapshot();
        this.applySnapshot(snapshot);
      } catch (error) {
        this.stale = Boolean(this.fetchedAt);
        this.error = error instanceof Error ? error.message : '状态数据加载失败';
      } finally {
        this.loading = false;
        this.offline = await detectOffline();
      }
    },
    ensurePersistSync() {
      if (syncInstalled || typeof window === 'undefined') {
        if (!this.fetchedAt) this.loadSnapshot();
        return;
      }
      syncInstalled = true;
      this.offline = !navigator.onLine;
      this.loadSnapshot();

      const refresh = async () => {
        this.offline = await detectOffline();
        if (!this.offline) this.loadSnapshot(true);
      };
      window.addEventListener('online', refresh);
      window.addEventListener('offline', refresh);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) this.loadSnapshot(true);
      });

      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SYNC_CHANNEL);
        channel.addEventListener('message', () => {
          this.loadSnapshot(true);
        });
      }
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) this.loadSnapshot(true);
      }, POLL_INTERVAL);
    },
    notifyPublished() {
      channel?.postMessage({ type: 'published', at: Date.now() });
      this.loadSnapshot(true);
    },
    stopSync() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      channel?.close();
      channel = null;
      syncInstalled = false;
    },
  },
});
