<template>
  <div class="public-history">
    <h1 class="sr-only">{{ store.siteConfig.text.historyTitle }}</h1>
    <t-card
      :title="store.siteConfig.text.historyTitle"
      :subtitle="store.siteConfig.text.historySubtitle"
      :bordered="false"
      class="public-history__intro"
    >
      <template #actions>
        <t-button theme="primary" variant="text" @click="goHome">返回状态页</t-button>
      </template>
    </t-card>

    <history-list v-if="loaded" grouped-by-card :entries="entries" @detail="openDrawer" />
    <div v-else class="public-history__boot" aria-busy="true" />
    <div v-if="loaded && hasMore" class="public-history__more">
      <t-button theme="default" variant="outline" :loading="loading" @click="loadMore">加载更多</t-button>
    </div>

    <public-event-overlay
      v-model:visible="drawerVisible"
      :header="drawerHeader"
      :kind="drawerKind"
      :event-id="drawerId"
      @close="onDrawerClose"
    />
  </div>
</template>

<script lang="ts">
export default {
  name: 'PublicHistory',
};
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { type HistoryEntry, publicStatusApi } from '@/api/status';
import { HISTORY_PAGE_BATCH_SIZE } from '@/constants/status';
import { useStatusStore } from '@/store';

import HistoryList from './components/HistoryList.vue';
import PublicEventOverlay from './components/PublicEventOverlay.vue';

const store = useStatusStore();
const router = useRouter();
const entries = ref<HistoryEntry[]>([]);
const nextCursor = ref<string | null>(null);
const loaded = ref(false);
const loading = ref(false);

const drawerVisible = ref(false);
const drawerKind = ref<'incident' | 'maintenance'>('incident');
const drawerId = ref('');

const drawerHeader = computed(() => (drawerKind.value === 'incident' ? '事件详情' : '维护详情'));
const hasMore = computed(() => Boolean(nextCursor.value));

const mergeDetailIntoStore = (page: HistoryEntry[]) => {
  const incidents = page.filter((item) => item.type === 'incident').map((item) => item.incident);
  const maintenances = page.filter((item) => item.type === 'maintenance').map((item) => item.maintenance);
  const incidentMap = new Map(store.incidents.map((item) => [item.id, item]));
  const maintenanceMap = new Map(store.maintenances.map((item) => [item.id, item]));
  incidents.forEach((item) => incidentMap.set(item.id, item));
  maintenances.forEach((item) => maintenanceMap.set(item.id, item));
  store.incidents = [...incidentMap.values()];
  store.maintenances = [...maintenanceMap.values()];
};

const loadMore = async () => {
  if (loading.value || (loaded.value && !nextCursor.value)) return;
  loading.value = true;
  try {
    const page = await publicStatusApi.history(nextCursor.value || '1', HISTORY_PAGE_BATCH_SIZE);
    entries.value.push(...page.items);
    nextCursor.value = page.nextCursor;
    loaded.value = true;
    mergeDetailIntoStore(page.items);
  } catch {
    loaded.value = true;
  } finally {
    loading.value = false;
  }
};

const openDrawer = (kind: 'incident' | 'maintenance', id: string) => {
  drawerKind.value = kind;
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
  loadMore();
});
</script>

<style lang="less" scoped>
.public-history {
  margin-bottom: 16px;
}

.public-history__intro {
  margin-bottom: 16px;

  :deep(.t-card__body) {
    display: none;
  }
}

.public-history__boot {
  min-height: 240px;
}

.public-history__more {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
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
