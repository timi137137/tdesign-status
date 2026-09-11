<template>
  <section class="status-banner" :class="`status-banner--${summary.status}`">
    <div class="status-banner__copy">
      <div class="status-banner__title">{{ summary.title }}</div>
      <div class="status-banner__message">{{ summary.message }}</div>
    </div>
    <component :is="iconComponent" class="status-banner__icon" aria-hidden="true" />
  </section>
</template>

<script lang="ts">
export default {
  name: 'StatusBanner',
};
</script>

<script setup lang="ts">
import { CheckCircleIcon, ErrorCircleIcon } from 'tdesign-icons-vue-next';
import { computed } from 'vue';

import type { OverallStatusSummary } from '@/types/status';

const props = defineProps<{
  summary: OverallStatusSummary;
}>();

/** 本机打包图标，不用 t-icon name（会拉 CDN sprite，生产 CSP 拦掉后右侧空白） */
const iconComponent = computed(() => (props.summary.status === 'up' ? CheckCircleIcon : ErrorCircleIcon));
</script>

<style lang="less" scoped>
.status-banner {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 32px;
  color: var(--td-text-color-anti);
  border-radius: var(--td-radius-medium);

  &--up {
    background: var(--td-success-color-7, #006c45);
  }

  &--down {
    background: var(--td-error-color-7, #b42318);
  }

  &--degraded {
    background: var(--td-warning-color-7, #9a5b00);
  }

  &--maintenance {
    background: var(--td-brand-color-7, var(--td-brand-color));
  }
}

.status-banner__copy {
  min-width: 0;
  flex: 1;
}

.status-banner__title {
  font-size: 28px;
  font-weight: 600;
  line-height: 36px;
}

.status-banner__message {
  margin-top: 8px;
  font-size: 14px;
  color: var(--td-text-color-anti);
}

.status-banner__icon {
  flex-shrink: 0;
  font-size: var(--td-comp-size-xxxxl);
  color: var(--td-text-color-anti) !important;

  :deep(svg) {
    color: var(--td-text-color-anti);
  }
}

@media (max-width: 640px) {
  .status-banner {
    padding: 20px 16px;
    gap: 16px;
  }

  .status-banner__title {
    font-size: 22px;
    line-height: 30px;
  }
}
</style>
