<template>
  <div class="public-status-page">
    <h1 class="sr-only">{{ store.siteConfig.siteName }}</h1>
    <div v-if="!store.fetchedAt && !store.error" class="public-status__boot" aria-busy="true">
      <t-card :bordered="false" class="public-status__card public-status__card--banner">
        <div class="status-banner-placeholder" />
      </t-card>
    </div>
    <template v-else>
      <t-card id="current" :bordered="false" class="public-status__card public-status__card--banner">
        <status-banner :summary="store.overall" />
      </t-card>

      <t-card
        v-if="store.siteConfig.sectionVisibility.maintenances && store.activeMaintenances.length"
        :title="store.siteConfig.text.maintenanceTitle"
        :bordered="false"
        class="public-status__card public-status__section"
        :style="{ order: sectionOrder('maintenances') }"
      >
        <div class="maintenance-preview">
          <maintenance-row
            v-for="item in previewMaintenances"
            :key="item.id"
            :item="item"
            @detail="openDrawer('maintenance', $event)"
          />
        </div>
        <div v-if="hiddenMaintenanceCount > 0" class="maintenance-more">
          <t-badge :count="hiddenMaintenanceCount" :max-count="99" :offset="[6, -4]">
            <t-button theme="default" variant="outline" @click="goAllMaintenances">查看全部维护</t-button>
          </t-badge>
        </div>
      </t-card>

      <t-card
        v-if="store.siteConfig.sectionVisibility.components"
        :title="store.siteConfig.text.componentTitle"
        :subtitle="store.siteConfig.text.componentSubtitle"
        :bordered="false"
        class="public-status__card public-status__card--components public-status__section"
        :style="{ order: sectionOrder('components') }"
      >
        <ul ref="componentListEl" class="component-list" :class="{ 'component-list--grid': useComponentGrid }">
          <li
            v-for="(service, index) in store.visibleServices"
            :key="service.id"
            class="component-list__item"
            :class="{ 'component-list__item--span': isLastOddComponent(index) }"
          >
            <div class="component-list__meta">
              <div>
                <div class="component-list__name">{{ service.name }}</div>
                <div v-if="service.description" class="component-list__desc">{{ service.description }}</div>
              </div>
              <t-space align="center" size="small">
                <t-tag :theme="SERVICE_STATUS_THEME[service.status]" variant="light">
                  {{ SERVICE_STATUS_LABEL[service.status] }}
                </t-tag>
                <span class="component-list__uptime">{{ service.uptime.toFixed(2) }}%</span>
              </t-space>
            </div>
            <heartbeat-bar
              :heartbeats="componentHeartbeats(service, index)"
              :period-days="isCompactHeartbeat(index) ? COMPACT_HEARTBEAT_DAYS : undefined"
            />
          </li>
        </ul>
      </t-card>

      <t-card
        v-if="store.siteConfig.sectionVisibility.incidents && store.activeIncidents.length"
        :title="store.siteConfig.text.incidentTitle"
        :bordered="false"
        class="public-status__card public-status__section"
        :style="{ order: sectionOrder('incidents') }"
      >
        <div v-for="incident in store.activeIncidents" :key="incident.id" class="summary-row">
          <div>
            <div class="summary-row__title">
              {{ incident.title }}
              <t-tag :theme="INCIDENT_IMPACT_THEME[incident.impact]" variant="light" size="small">
                {{ INCIDENT_IMPACT_LABEL[incident.impact] }}
              </t-tag>
            </div>
            <div class="summary-row__sub">
              {{ INCIDENT_STATUS_LABEL[incident.status] }} · {{ latestBody(incident.updates) }}
            </div>
          </div>
          <t-button theme="primary" variant="text" size="small" @click="openDrawer('incident', incident.id)">
            查看详情
          </t-button>
        </div>
      </t-card>

      <t-card
        v-if="store.siteConfig.sectionVisibility.history"
        id="history"
        :title="store.siteConfig.text.historyTitle"
        :subtitle="store.siteConfig.text.historySubtitle"
        :bordered="false"
        class="public-status__card public-status__section"
        :style="{ order: sectionOrder('history') }"
      >
        <template #actions>
          <t-tooltip content="查看全部历史">
            <t-button theme="default" shape="square" variant="text" aria-label="查看全部历史" @click="goAllHistory">
              <view-list-icon />
            </t-button>
          </t-tooltip>
        </template>
        <history-list :entries="previewHistory" @detail="openDrawer" />
        <t-divider class="history-more-divider" align="center">{{ store.siteConfig.text.historyMoreHint }}</t-divider>
      </t-card>

      <public-event-overlay
        v-model:visible="drawerVisible"
        :header="drawerHeader"
        :kind="drawerKind"
        :event-id="drawerId"
        @close="onDrawerClose"
      />
    </template>
  </div>
</template>

<script lang="ts">
export default {
  name: 'PublicStatus',
};
</script>

<script setup lang="ts">
import { ViewListIcon } from 'tdesign-icons-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import HeartbeatBar from '@/components/status/HeartbeatBar.vue';
import {
  COMPACT_HEARTBEAT_DAYS,
  COMPONENT_GRID_MIN_WIDTH,
  COMPONENT_GRID_THRESHOLD,
  INCIDENT_IMPACT_LABEL,
  INCIDENT_IMPACT_THEME,
  INCIDENT_STATUS_LABEL,
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_THEME,
} from '@/constants/status';
import { useStatusStore } from '@/store';
import type { ServiceMonitor, StatusUpdate } from '@/types/status';

import HistoryList from './components/HistoryList.vue';
import MaintenanceRow from './components/MaintenanceRow.vue';
import PublicEventOverlay from './components/PublicEventOverlay.vue';
import StatusBanner from './components/StatusBanner.vue';

const store = useStatusStore();
const route = useRoute();
const router = useRouter();

const drawerVisible = ref(false);
const drawerKind = ref<'incident' | 'maintenance'>('incident');
const drawerId = ref('');

const drawerHeader = computed(() => (drawerKind.value === 'incident' ? '事件详情' : '维护详情'));

const latestBody = (updates: StatusUpdate[]) => updates[updates.length - 1]?.body || '';

const sectionOrder = (section: 'maintenances' | 'components' | 'incidents' | 'history') =>
  store.siteConfig.sectionOrder.indexOf(section) + 1;

const openDrawer = (kind: 'incident' | 'maintenance', id: string) => {
  drawerKind.value = kind;
  drawerId.value = id;
  drawerVisible.value = true;
};

const previewMaintenances = computed(() => store.activeMaintenances.slice(0, store.siteConfig.maintenancePreviewLimit));

const hiddenMaintenanceCount = computed(() =>
  Math.max(0, store.activeMaintenances.length - store.siteConfig.maintenancePreviewLimit),
);

const componentListEl = ref<HTMLElement | null>(null);
const componentListWidth = ref(0);

const useComponentGrid = computed(
  () => store.visibleServices.length > COMPONENT_GRID_THRESHOLD && componentListWidth.value >= COMPONENT_GRID_MIN_WIDTH,
);

const isLastOddComponent = (index: number) => {
  const total = store.visibleServices.length;
  return useComponentGrid.value && total % 2 === 1 && index === total - 1;
};

const isCompactHeartbeat = (index: number) => useComponentGrid.value && !isLastOddComponent(index);

const componentHeartbeats = (service: ServiceMonitor, index: number) => {
  if (isCompactHeartbeat(index)) {
    const daily = service.dailyHeartbeats || [];
    return daily.slice(-COMPACT_HEARTBEAT_DAYS);
  }
  return service.heartbeats;
};

const goAllMaintenances = () => {
  router.push({ path: '/maintenances' });
};

const previewHistory = computed(() => store.historyFeed.slice(0, store.siteConfig.historyPreviewLimit));

const goAllHistory = () => {
  router.push({ path: '/history' });
};

const onDrawerClose = () => {
  drawerVisible.value = false;
  if (route.query.kind || route.query.id) {
    router.replace({ path: '/', query: {} });
  }
};

watch(
  () => [route.query.kind, route.query.id],
  ([kind, id]) => {
    if ((kind === 'incident' || kind === 'maintenance') && id) {
      openDrawer(kind, String(id));
    }
  },
  { immediate: true },
);

let componentListObserver: ResizeObserver | null = null;

const bindComponentList = () => {
  componentListObserver?.disconnect();
  componentListObserver = null;
  const el = componentListEl.value;
  if (!el) return;
  const updateWidth = () => {
    componentListWidth.value = el.getBoundingClientRect().width;
  };
  updateWidth();
  componentListObserver = new ResizeObserver(updateWidth);
  componentListObserver.observe(el);
};

watch(
  () => store.fetchedAt,
  async () => {
    await nextTick();
    bindComponentList();
  },
);

onMounted(() => {
  bindComponentList();
});

onBeforeUnmount(() => {
  componentListObserver?.disconnect();
  componentListObserver = null;
});
</script>

<style lang="less" scoped>
.public-status-page {
  display: flex;
  flex-direction: column;
}

.status-banner-placeholder {
  min-height: 120px;
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

#current,
#history {
  scroll-margin-top: 72px;
}

.public-status__card {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.public-status__card--banner {
  :deep(.t-card__body) {
    padding: 0;
  }
}

.public-status__card--components {
  :deep(.t-card__body) {
    overflow: visible;
  }
}

.component-list {
  list-style: none;
  margin: 0;
  padding: 0;

  &:not(&--grid) {
    .component-list__item {
      padding: 16px 0;
      border-bottom: 1px solid var(--td-component-border);

      &:first-child {
        padding-top: 0;
      }

      &:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
    }
  }

  &--grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;

    .component-list__item {
      margin: 0;
      min-width: 0;
      overflow: visible;
      padding: 16px;
      border: 1px solid var(--td-component-border);
      border-radius: var(--td-radius-medium);
      background: var(--td-bg-color-container);
      transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;

      @media (hover: hover) and (pointer: fine) {
        &:hover {
          transform: translateY(-2px);
          box-shadow: var(--td-shadow-1);
          border-color: var(--td-brand-color);
        }
      }
    }

    .component-list__meta {
      margin-bottom: 10px;
    }

    .component-list__item--span {
      grid-column: 1 / -1;
    }
  }
}

.component-list__meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 10px;
}

.component-list__name {
  font-size: 16px;
  font-weight: 600;
}

.component-list__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.component-list__uptime {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

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

.maintenance-more {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

.history-more-divider {
  margin: 16px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .component-list__meta,
  .summary-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
