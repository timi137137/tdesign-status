<template>
  <router-view v-if="!isRefreshing" v-slot="{ Component }">
    <keep-alive v-if="keepAliveEnabled" :include="aliveViews">
      <component :is="Component" :key="route.fullPath" />
    </keep-alive>
    <component :is="Component" v-else :key="route.fullPath" />
  </router-view>
</template>

<script setup lang="ts">
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useTabsRouterStore } from '@/store';

const route = useRoute();

const keepAliveEnabled = computed(() => {
  const keepAliveConfig = route.meta?.keepAlive;
  return keepAliveConfig === undefined || keepAliveConfig === true;
});

const aliveViews = computed(() => {
  const tabsRouterStore = useTabsRouterStore();
  const { tabRouters } = tabsRouterStore;
  return tabRouters
    .filter((item) => {
      const keepAliveConfig = item.meta?.keepAlive;
      const isRouteKeepAlive = keepAliveConfig === undefined || keepAliveConfig === true;
      return item.isAlive && isRouteKeepAlive;
    })
    .map((item) => item.name);
}) as ComputedRef<string[]>;

const isRefreshing = computed(() => {
  const tabsRouterStore = useTabsRouterStore();
  const { refreshing } = tabsRouterStore;
  return refreshing;
});
</script>
