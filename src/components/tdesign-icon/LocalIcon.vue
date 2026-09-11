<template>
  <component :is="resolved" class="t-icon" :size="size" v-bind="$attrs" />
</template>

<script lang="ts">
export default {
  name: 'TIcon',
  inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { type Component, computed } from 'vue';

import { LOCAL_ICONS } from './icons';

const props = defineProps<{
  name?: string;
  size?: string;
}>();

const resolved = computed<Component | 'span'>(() => {
  if (!props.name) return 'span';
  return LOCAL_ICONS[props.name] || 'span';
});
</script>
