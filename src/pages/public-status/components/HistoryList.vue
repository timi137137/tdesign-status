<template>
  <div class="history-list" :class="{ 'history-list--cards': groupedByCard }">
    <component
      :is="DayWrap"
      v-for="group in groups"
      :key="group.day"
      v-bind="dayWrapProps(group.day)"
      :class="groupedByCard ? 'history-day-card' : 'history-day'"
    >
      <p v-if="!groupedByCard" class="history-day__label">{{ group.day }}</p>
      <div v-for="entry in group.items" :key="entry.key" class="history-list__row">
        <template v-if="entry.incident">
          <div>
            <div class="history-list__title">
              {{ entry.incident.title }}
              <t-tag variant="light" size="small">{{ INCIDENT_STATUS_LABEL[entry.incident.status] }}</t-tag>
            </div>
            <div class="history-list__sub">{{ formatTime(entry.incident.startedAt) }}</div>
          </div>
          <t-button theme="primary" variant="text" size="small" @click="openDetail('incident', entry.incident.id)">
            查看详情
          </t-button>
        </template>
        <template v-else-if="entry.maintenance">
          <div>
            <div class="history-list__title">
              {{ entry.maintenance.title }}
              <t-tag :theme="MAINTENANCE_STATUS_THEME[entry.maintenance.status]" variant="light" size="small">
                {{ MAINTENANCE_STATUS_LABEL[entry.maintenance.status] }}
              </t-tag>
            </div>
            <div class="history-list__sub">{{ formatTime(entry.maintenance.scheduledStart) }}</div>
          </div>
          <t-button
            theme="primary"
            variant="text"
            size="small"
            @click="openDetail('maintenance', entry.maintenance.id)"
          >
            查看详情
          </t-button>
        </template>
      </div>
    </component>
    <t-empty v-if="!groups.length" description="暂无历史记录" />
  </div>
</template>

<script lang="ts">
export default {
  name: 'HistoryList',
};
</script>

<script setup lang="ts">
import { computed, resolveComponent } from 'vue';

import { INCIDENT_STATUS_LABEL, MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_THEME } from '@/constants/status';
import { useStatusStore } from '@/store';
import type { Incident, Maintenance } from '@/types/status';
import { formatStatusTime } from '@/utils/status-date';

import { historyDayKey } from '../history-batch';

type HistoryFeedEntry = {
  type: 'incident' | 'maintenance';
  at: number;
  incident?: Incident;
  maintenance?: Maintenance;
};

const props = defineProps<{
  entries: HistoryFeedEntry[];
  groupedByCard?: boolean;
}>();

const emit = defineEmits<{
  (e: 'detail', kind: 'incident' | 'maintenance', id: string): void;
}>();

const store = useStatusStore();
const DayWrap = computed(() => (props.groupedByCard ? resolveComponent('t-card') : 'div'));

const dayWrapProps = (day: string) => (props.groupedByCard ? { title: day, headerBordered: true } : {});

const formatTime = (at: number) => formatStatusTime(at, store.siteConfig.timezone, store.siteConfig.dateFormat);

const openDetail = (kind: 'incident' | 'maintenance', id: string) => {
  emit('detail', kind, id);
};

const groups = computed(() => {
  const result: Record<
    string,
    {
      day: string;
      items: Array<{ key: string; incident?: Incident; maintenance?: Maintenance }>;
    }
  > = {};
  props.entries.forEach((entry) => {
    const day = historyDayKey(entry.at);
    if (!result[day]) result[day] = { day, items: [] };
    if (entry.incident) {
      result[day].items.push({ key: `inc-${entry.incident.id}`, incident: entry.incident });
    } else if (entry.maintenance) {
      result[day].items.push({ key: `mnt-${entry.maintenance.id}`, maintenance: entry.maintenance });
    }
  });
  return Object.values(result);
});
</script>

<style lang="less" scoped>
.history-list--cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-day-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 140px;
}

.history-day {
  .history-day__label {
    font-size: 15px;
    font-weight: 600;
    margin: 8px 0 12px;
    color: var(--td-text-color-secondary);
  }

  &:first-child .history-day__label {
    margin-top: 0;
  }
}

.history-list__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--td-component-stroke);

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
}

.history-day:first-child .history-list__row:first-child,
.history-day-card .history-list__row:first-child {
  padding-top: 0;
}

.history-list__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  flex-wrap: wrap;
}

.history-list__sub {
  margin-top: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

@media (max-width: 640px) {
  .history-list__row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
