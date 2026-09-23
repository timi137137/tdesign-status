import { defineStore } from 'pinia';

import { adminApi, type DashboardAuditItem } from '@/api/admin';
import { store } from '@/store/pinia';
import type { NotificationItem } from '@/types/interface';
import { formatStatusTime } from '@/utils/status-date';

const ENTITY_LABEL: Record<string, string> = {
  user: '用户',
  session: '会话',
  site_config: '站点配置',
  service: '服务',
  incident: '事件',
  maintenance: '维护',
  dashboard_layout: '仪表盘布局',
};

const toNotification = (item: DashboardAuditItem, readIds: string[]): NotificationItem => ({
  id: item.id,
  content: item.action,
  type: ENTITY_LABEL[item.entityType] || item.entityType,
  status: !readIds.includes(item.id),
  collected: false,
  date: formatStatusTime(item.createdAt),
  quality: 'middle',
});

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    msgData: [] as NotificationItem[],
    readIds: [] as string[],
  }),
  getters: {
    unreadMsg: (state) => state.msgData.filter((item) => item.status),
    readMsg: (state) => state.msgData.filter((item) => !item.status),
  },
  actions: {
    setMsgData(data: NotificationItem[]) {
      this.msgData = data;
      this.readIds = data.filter((item) => !item.status).map((item) => item.id);
    },
    async loadLatest() {
      try {
        const overview = await adminApi.dashboard();
        this.msgData = overview.recentAudit.slice(0, 8).map((item) => toNotification(item, this.readIds));
      } catch {
        this.msgData = [];
      }
    },
  },
  persist: {
    pick: ['readIds'],
  },
});

export function getNotificationStore() {
  return useNotificationStore(store);
}
