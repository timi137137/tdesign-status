<template>
  <div class="summary-row">
    <div class="summary-row__main">
      <div class="summary-row__title">
        {{ item.title }}
        <t-tag :theme="MAINTENANCE_STATUS_THEME[item.status]" variant="light" size="small">
          {{ MAINTENANCE_STATUS_LABEL[item.status] }}
        </t-tag>
      </div>
      <div class="summary-row__sub">
        {{ formatTime(item.scheduledStart) }} — {{ formatTime(item.scheduledEnd) }} · 影响组件：{{ affectedText }}
      </div>
    </div>
    <t-button theme="primary" variant="text" size="small" @click="$emit('detail', item.id)">查看详情</t-button>
  </div>
</template>

<script lang="ts">
export default {
  name: 'MaintenanceRow',
};
</script>

<script setup lang="ts">
import { computed } from 'vue';

import { MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_THEME } from '@/constants/status';
import { useStatusStore } from '@/store';
import type { Maintenance } from '@/types/status';
import { formatStatusTime } from '@/utils/status-date';

const props = defineProps<{
  item: Maintenance;
}>();

defineEmits<{
  (e: 'detail', id: string): void;
}>();

const store = useStatusStore();

const formatTime = (at: number) => formatStatusTime(at, store.siteConfig.timezone, store.siteConfig.dateFormat);

const affectedText = computed(() => {
  const ids = props.item.affectedServiceIds;
  if (!ids.length) return '未指定';
  return ids.map((id) => store.serviceNameMap[id] || id).join('、');
});
</script>

<style lang="less" scoped>
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--td-component-stroke);

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
}

.summary-row__main {
  flex: 1;
}

.summary-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  flex-wrap: wrap;
}

.summary-row__sub {
  margin-top: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

@media (max-width: 640px) {
  .summary-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
