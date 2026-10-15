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
  /** 每格代表的时间跨度，用来标出每格的时间点。 */
  bucketMs: number;
}>();

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const HEARTBEAT_LABEL: Record<number, string> = {
  [-1]: '无数据',
  0: '异常',
  1: '正常',
  2: '维护中',
  3: '降级',
};

const barTitle = computed(() => `最近 ${formatSpan(props.heartbeats.length * props.bucketMs)}`);

const accessibleSummary = computed(() => {
  const counts = props.heartbeats.reduce(
    (result, beat) => {
      result[beat] += 1;
      return result;
    },
    { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: 0 } as Record<number, number>,
  );
  return `${barTitle.value}：正常 ${counts[1]}，异常 ${counts[0]}，维护 ${counts[2]}，降级 ${counts[3]}，无数据 ${counts[-1]}`;
});

const beatClass = (beat: HeartbeatValue) => {
  if (beat === -1) return 'nodata';
  if (beat === 0) return 'down';
  if (beat === 2) return 'maintenance';
  if (beat === 3) return 'degraded';
  return 'up';
};

/** 每格标它覆盖到的最后时间点，与后端按窗口末端切格的口径一致。 */
const beatTitle = (beat: HeartbeatValue, index: number) => {
  const bucketEnd = Date.now() - (props.heartbeats.length - 1 - index) * props.bucketMs;
  const format = props.bucketMs >= DAY_MS ? 'YYYY-MM-DD' : 'MM-DD HH:mm';
  return `${dayjs(bucketEnd).format(format)} ${HEARTBEAT_LABEL[beat]}`;
};

function formatSpan(ms: number): string {
  // 只有超过一天才用"天"：24 小时按小时说更贴近"近 24 小时探测"的口径。
  if (ms > DAY_MS && ms % DAY_MS === 0) return `${ms / DAY_MS} 天`;
  if (ms >= HOUR_MS && ms % HOUR_MS === 0) return `${ms / HOUR_MS} 小时`;
  return `${Math.round(ms / MINUTE_MS)} 分钟`;
}
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
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;

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

  &.is-nodata {
    background: var(--td-gray-color-4);
  }
}
</style>
