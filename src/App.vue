<template>
  <router-view :class="[mode]" />
  <pwa-update-prompt />
</template>
<script setup lang="ts">
import { computed } from 'vue';

import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue';
import { useSettingStore } from '@/store';

const store = useSettingStore();

const mode = computed(() => store.displayMode);
</script>
<style lang="less" scoped>
#nprogress .bar {
  background: var(--td-brand-color) !important;
}
</style>
