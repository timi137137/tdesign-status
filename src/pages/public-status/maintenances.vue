<template>
  <div>
    <h1 class="sr-only">{{ store.siteConfig.text.maintenanceTitle }}</h1>
    <t-card :title="store.siteConfig.text.maintenanceTitle" :bordered="false" class="public-maintenances">
      <template #actions>
        <t-button theme="primary" variant="text" @click="goHome">返回状态页</t-button>
      </template>
      <maintenance-row v-for="item in store.activeMaintenances" :key="item.id" :item="item" @detail="openDrawer" />
      <t-empty v-if="!store.activeMaintenances.length" :description="store.siteConfig.text.emptyMaintenance" />
    </t-card>

    <public-event-overlay
      v-model:visible="drawerVisible"
      header="维护详情"
      kind="maintenance"
      :event-id="drawerId"
      @close="onDrawerClose"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'PublicMaintenances',
};
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useStatusStore } from '@/store';

import MaintenanceRow from './components/MaintenanceRow.vue';
import PublicEventOverlay from './components/PublicEventOverlay.vue';

const store = useStatusStore();
const router = useRouter();

const drawerVisible = ref(false);
const drawerId = ref('');

const openDrawer = (id: string) => {
  drawerId.value = id;
  drawerVisible.value = true;
};

const onDrawerClose = () => {
  drawerVisible.value = false;
};

const goHome = () => {
  router.push({ path: '/' });
};

onMounted(() => {
  if (!store.fetchedAt) store.loadSnapshot();
});
</script>

<style lang="less" scoped>
.public-maintenances {
  margin-bottom: 16px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
