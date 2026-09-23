<template>
  <div class="heartbeat-bar" :title="barTitle" role="img" :aria-label="accessibleSummary">
    <span
      v-for="(beat, index) in heartbeats"
      :key="`${index}-${beat}`"
      class="heartbeat-bar__cell"
      :class="`is-${beatClass(beat)}`"
      :title="beatTitle(beat, index)"
      aria-hidden="true"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'HeartbeatBar',
};
</script>

<script setup lang="ts">
import dayjs from 'dayjs';
import { computed } from 'vue';

import type { HeartbeatValue } from '@/types/status';

const props = defineProps<{
  heartbeats: HeartbeatValue[];
  periodDays?: number;
}>();

const barTitle = computed(() =>
  props.periodDays ? `最近 ${props.periodDays} 天` : `最近 ${props.heartbeats.length} 次探测`,
);

const accessibleSummary = computed(() => {
  const counts = props.heartbeats.reduce(
    (result, beat) => {
      result[beat] += 1;
      return result;
    },
    { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<HeartbeatValue, number>,
  );
  return `${barTitle.value}：正常 ${counts[1]}，异常 ${counts[0]}，维护 ${counts[2]}，降级 ${counts[3]}`;
});

const beatClass = (beat: HeartbeatValue) => {
  if (beat === 0) return 'down';
  if (beat === 2) return 'maintenance';
  if (beat === 3) return 'degraded';
  return 'up';
};

const beatTitle = (beat: HeartbeatValue, index: number) => {
  const labelMap: Record<HeartbeatValue, string> = {
    0: '异常',
    1: '正常',
    2: '维护中',
    3: '降级',
  };
  const label = labelMap[beat];
  if (props.periodDays) {
    const dayOffset = props.heartbeats.length - 1 - index;
    return `${dayjs().subtract(dayOffset, 'day').format('YYYY-MM-DD')} ${label}`;
  }
  return `#${index + 1} ${label}`;
};
</script>

<style lang="less" scoped>
.heartbeat-bar {
  display: flex;
  gap: 2px;
  width: 100%;
  min-width: 0;
  overflow: visible;
  height: 28px;
  padding: 3px 0;
  box-sizing: border-box;
  align-items: stretch;
}

.heartbeat-bar__cell {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 2px;
  transform-origin: center;
  transition: background-color 0.2s ease, transform 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: scaleY(1.25);
      z-index: 1;
    }
  }

  &.is-up {
    background: var(--td-success-color);
  }

  &.is-down {
    background: var(--td-error-color);
  }

  &.is-maintenance {
    background: var(--td-brand-color);
  }

  &.is-degraded {
    background: var(--td-warning-color);
  }
}
</style>
