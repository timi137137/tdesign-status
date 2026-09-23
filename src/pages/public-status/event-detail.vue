<template>
  <div class="event-detail">
    <t-empty v-if="!detail" description="记录不存在或已删除" />

    <template v-else-if="incident">
      <div class="event-detail__head">
        <h1>{{ incident.title }}</h1>
        <t-space>
          <t-tag :theme="INCIDENT_IMPACT_THEME[incident.impact]" variant="light">
            {{ INCIDENT_IMPACT_LABEL[incident.impact] }}
          </t-tag>
          <t-tag variant="light">{{ INCIDENT_STATUS_LABEL[incident.status] }}</t-tag>
        </t-space>
      </div>
      <p class="event-detail__meta">
        开始于 {{ formatTime(incident.startedAt) }}
        <span v-if="incident.resolvedAt"> · 恢复于 {{ formatTime(incident.resolvedAt) }}</span>
        · 影响组件：{{ affectedNames(incident.affectedServiceIds) }}
      </p>
      <t-timeline
        class="event-detail__timeline"
        :mode="isMobile ? 'same' : 'alternate'"
        :label-align="isMobile ? 'left' : 'alternate'"
      >
        <t-timeline-item
          v-for="update in reversedUpdates(incident.updates)"
          :key="update.id"
          :label="formatTime(update.at)"
        >
          <div class="event-detail__update-title">{{ incidentStatusLabel(update.status) }}</div>
          <p>{{ update.body }}</p>
        </t-timeline-item>
      </t-timeline>
    </template>

    <template v-else-if="maintenance">
      <div class="event-detail__head">
        <h1>{{ maintenance.title }}</h1>
        <t-tag :theme="MAINTENANCE_STATUS_THEME[maintenance.status]" variant="light">
          {{ MAINTENANCE_STATUS_LABEL[maintenance.status] }}
        </t-tag>
      </div>
      <p v-if="maintenance.description" class="event-detail__desc">{{ maintenance.description }}</p>
      <p class="event-detail__meta">
        {{ formatTime(maintenance.scheduledStart) }} — {{ formatTime(maintenance.scheduledEnd) }} · 影响组件：{{
          affectedNames(maintenance.affectedServiceIds)
        }}
      </p>
      <t-progress
        :percentage="maintenance.progress"
        :status="maintenance.status === 'completed' ? 'success' : 'active'"
      />
      <t-timeline
        class="event-detail__timeline"
        :mode="isMobile ? 'same' : 'alternate'"
        :label-align="isMobile ? 'left' : 'alternate'"
      >
        <t-timeline-item
          v-for="update in reversedUpdates(maintenance.updates)"
          :key="update.id"
          :label="formatTime(update.at)"
        >
          <div class="event-detail__update-title">{{ maintenanceStatusLabel(update.status) }}</div>
          <p>{{ update.body }}</p>
        </t-timeline-item>
      </t-timeline>
    </template>
  </div>
</template>

<script lang="ts">
export default {
  name: 'PublicEventDetail',
};
</script>

<script setup lang="ts">
import { computed, watch } from 'vue';

import { publicStatusApi } from '@/api/status';
import {
  INCIDENT_IMPACT_LABEL,
  INCIDENT_IMPACT_THEME,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_THEME,
} from '@/constants/status';
import { useStatusStore } from '@/store';
import type { IncidentStatus, MaintenanceStatus, StatusUpdate } from '@/types/status';
import { formatStatusTime } from '@/utils/status-date';

import { useIsMobile } from './use-is-mobile';

const props = defineProps<{
  kind: 'incident' | 'maintenance';
  id: string;
}>();

const store = useStatusStore();
const isMobile = useIsMobile();
const isIncident = computed(() => props.kind === 'incident');

const incident = computed(() => (isIncident.value ? store.incidents.find((item) => item.id === props.id) : undefined));

const maintenance = computed(() =>
  isIncident.value ? undefined : store.maintenances.find((item) => item.id === props.id),
);

const detail = computed(() => incident.value || maintenance.value);

const formatTime = (at: number) => formatStatusTime(at, store.siteConfig.timezone, store.siteConfig.dateFormat);

const affectedNames = (ids: string[]) => {
  if (!ids.length) return '未指定';
  return ids.map((id) => store.serviceNameMap[id] || id).join('、');
};

const reversedUpdates = (updates: StatusUpdate[]) => [...updates].reverse();

const incidentStatusLabel = (status: StatusUpdate['status']) =>
  INCIDENT_STATUS_LABEL[status as IncidentStatus] || status;

const maintenanceStatusLabel = (status: StatusUpdate['status']) =>
  MAINTENANCE_STATUS_LABEL[status as MaintenanceStatus] || status;

watch(
  () => [props.kind, props.id] as const,
  async ([kind, id]) => {
    if (!id) return;
    try {
      if (kind === 'incident' && !store.incidents.some((item) => item.id === id)) {
        const item = await publicStatusApi.incident(id);
        store.incidents = [...store.incidents, item];
      }
      if (kind === 'maintenance' && !store.maintenances.some((item) => item.id === id)) {
        const item = await publicStatusApi.maintenance(id);
        store.maintenances = [...store.maintenances, item];
      }
    } catch (error) {
      store.error = error instanceof Error ? error.message : '详情加载失败';
    }
  },
  { immediate: true },
);
</script>

<style lang="less" scoped>
.event-detail {
  padding-bottom: 8px;
}

.event-detail__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
}

.event-detail__desc,
.event-detail__meta {
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 12px;
}

.event-detail__timeline {
  width: 100%;
  margin-top: 20px;

  :deep(.t-timeline-item__label) {
    font-size: 12px;
    color: var(--td-text-color-placeholder);
    white-space: nowrap;
  }
}

.event-detail__update-title {
  font-weight: 600;
}

.event-detail__timeline p {
  margin: 4px 0 0;
}

@media (max-width: 640px) {
  .event-detail__head {
    flex-direction: column;
  }
}
</style>
