<template>
  <main class="overview" aria-labelledby="overview-title">
    <header class="page-header">
      <div>
        <h1 id="overview-title">运营概览</h1>
        <p>查看当前公开状态、未恢复事件与即将到来的维护窗口。</p>
      </div>
      <t-space>
        <t-button variant="outline" :disabled="savingLayout" @click="resetLayout">恢复默认布局</t-button>
        <t-button theme="primary" :loading="savingLayout" :disabled="!layoutDirty" @click="saveLayout">
          保存布局
        </t-button>
      </t-space>
    </header>

    <t-alert v-if="loadError" theme="error" title="概览加载失败" :message="loadError">
      <template #operation>
        <t-button variant="text" @click="loadAll">重试</t-button>
      </template>
    </t-alert>

    <div v-if="loading" class="state-panel" role="status" aria-live="polite">
      <t-loading text="正在加载运营概览" />
    </div>

    <section v-else class="widget-list" aria-label="可配置概览模块">
      <article v-for="(widget, index) in visibleWidgets" :key="widget" class="widget">
        <header class="widget-toolbar">
          <h2>{{ widgetLabel[widget] }}</h2>
          <t-space>
            <t-button
              size="small"
              variant="text"
              :disabled="index === 0"
              :aria-label="`上移${widgetLabel[widget]}`"
              @click="moveWidget(widget, -1)"
            >
              上移
            </t-button>
            <t-button
              size="small"
              variant="text"
              :disabled="index === visibleWidgets.length - 1"
              :aria-label="`下移${widgetLabel[widget]}`"
              @click="moveWidget(widget, 1)"
            >
              下移
            </t-button>
          </t-space>
        </header>

        <t-card v-if="widget === 'counts'" :bordered="false">
          <ul class="count-grid">
            <li v-for="item in countCards" :key="item.label">
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </li>
          </ul>
        </t-card>

        <t-card v-else-if="widget === 'snapshot'" :bordered="false">
          <dl class="meta-list">
            <div>
              <dt>公开站点名称</dt>
              <dd>{{ publishedSiteName }}</dd>
            </div>
            <div>
              <dt>快照版本</dt>
              <dd>{{ overview?.snapshot?.version ?? '尚未生成' }}</dd>
            </div>
            <div>
              <dt>最近发布</dt>
              <dd>{{ snapshotTime }}</dd>
            </div>
          </dl>
        </t-card>

        <t-card v-else-if="widget === 'incidents'" :bordered="false">
          <t-empty v-if="!overview?.activeIncidents.length" description="当前没有未恢复事件" />
          <ul v-else class="plain-list">
            <li v-for="incident in overview.activeIncidents" :key="incident.id">
              <button type="button" class="title-link" @click="openIncident(incident.id)">
                {{ incident.title }}
              </button>
              <span>{{ incidentStatusLabel(incident.status) }} · {{ formatTime(incident.startedAt) }}</span>
            </li>
          </ul>
        </t-card>

        <t-card v-else-if="widget === 'maintenances'" :bordered="false">
          <t-empty v-if="!overview?.activeMaintenances.length" description="当前没有进行中或已排期的维护" />
          <ul v-else class="plain-list">
            <li v-for="item in overview.activeMaintenances" :key="item.id">
              <button type="button" class="title-link" @click="openMaintenance(item.id)">
                {{ item.title }}
              </button>
              <span>{{ maintenanceStatusLabel(item.status) }} · {{ formatTime(item.scheduledStart) }}</span>
            </li>
          </ul>
        </t-card>

        <t-card v-else-if="widget === 'services'" :bordered="false">
          <t-empty v-if="!overview?.services.length" description="尚未配置服务" />
          <ul v-else class="plain-list">
            <li v-for="service in overview.services" :key="service.id">
              <strong>{{ service.name }}</strong>
              <span>{{ serviceStatusLabel(service.status) }} · 可用率 {{ service.uptime.toFixed(2) }}%</span>
            </li>
          </ul>
        </t-card>

        <t-card v-else-if="widget === 'audit'" :bordered="false">
          <t-empty v-if="!overview?.recentAudit.length" description="暂无最近审计记录" />
          <ul v-else class="plain-list">
            <li v-for="item in overview.recentAudit" :key="item.id">
              <strong>{{ item.action }}</strong>
              <span>{{ item.entityType }} · {{ formatTime(item.createdAt) }}</span>
            </li>
          </ul>
        </t-card>
      </article>
    </section>
  </main>
</template>

<script lang="ts">
export default {
  name: 'DashboardOverview',
};
</script>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { adminApi, type DashboardLayoutConfig, type DashboardOverview, type DashboardWidgetId } from '@/api/admin';
import { INCIDENT_STATUS_LABEL, MAINTENANCE_STATUS_LABEL, SERVICE_STATUS_LABEL } from '@/constants/status';
import { useUserStore } from '@/store';
import { formatStatusTime } from '@/utils/status-date';

const DEFAULT_WIDGETS: DashboardWidgetId[] = ['counts', 'incidents', 'maintenances', 'services', 'snapshot', 'audit'];

const widgetLabel: Record<DashboardWidgetId, string> = {
  counts: '关键计数',
  incidents: '未恢复事件',
  maintenances: '计划与进行中维护',
  services: '服务状态',
  snapshot: '公开发布',
  audit: '最近审计',
};

const router = useRouter();
const userStore = useUserStore();
const loading = ref(true);
const loadError = ref('');
const savingLayout = ref(false);
const overview = ref<DashboardOverview | null>(null);
const widgets = ref<DashboardWidgetId[]>([...DEFAULT_WIDGETS]);
const savedWidgets = ref<DashboardWidgetId[]>([...DEFAULT_WIDGETS]);
const layoutVersion = ref<number | undefined>(undefined);

const canSeeAudit = computed(() => userStore.permissions.includes('audit:read'));
const visibleWidgets = computed(() => widgets.value.filter((id) => id !== 'audit' || canSeeAudit.value));
const layoutDirty = computed(() => JSON.stringify(widgets.value) !== JSON.stringify(savedWidgets.value));
const publishedSiteName = computed(
  () =>
    overview.value?.siteConfig?.publishedJson?.siteName || overview.value?.siteConfig?.draftJson.siteName || '未设置',
);
const snapshotTime = computed(() =>
  overview.value?.snapshot?.lastModified ? formatStatusTime(overview.value.snapshot.lastModified) : '尚未发布',
);
const countCards = computed(() => [
  { label: '启用服务', value: overview.value?.counts.enabledServices ?? 0 },
  { label: '未恢复事件', value: overview.value?.counts.activeIncidents ?? 0 },
  { label: '未完成维护', value: overview.value?.counts.scheduledMaintenances ?? 0 },
  { label: '启用账号', value: overview.value?.counts.activeUsers ?? 0 },
]);

const formatTime = (value: number) => formatStatusTime(value);
const incidentStatusLabel = (status: keyof typeof INCIDENT_STATUS_LABEL) => INCIDENT_STATUS_LABEL[status];
const maintenanceStatusLabel = (status: keyof typeof MAINTENANCE_STATUS_LABEL) => MAINTENANCE_STATUS_LABEL[status];
const serviceStatusLabel = (status: keyof typeof SERVICE_STATUS_LABEL) => SERVICE_STATUS_LABEL[status];
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const normalizeWidgets = (value: DashboardLayoutConfig | null | undefined): DashboardWidgetId[] => {
  const incoming = Array.isArray(value?.widgets) ? value.widgets : DEFAULT_WIDGETS;
  const known = incoming.filter((item): item is DashboardWidgetId => DEFAULT_WIDGETS.includes(item));
  const missing = DEFAULT_WIDGETS.filter((item) => !known.includes(item));
  return [...known, ...missing];
};

const loadAll = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const [data, layout] = await Promise.all([adminApi.dashboard(), adminApi.layout.get()]);
    overview.value = data;
    const next = normalizeWidgets(layout?.layoutJson);
    widgets.value = next;
    savedWidgets.value = [...next];
    layoutVersion.value = layout?.version;
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const moveWidget = (id: DashboardWidgetId, offset: -1 | 1) => {
  const current = [...widgets.value];
  const index = current.indexOf(id);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
  const [item] = current.splice(index, 1);
  current.splice(nextIndex, 0, item);
  widgets.value = current;
};

const saveLayout = async () => {
  savingLayout.value = true;
  try {
    const saved = await adminApi.layout.save({ widgets: widgets.value }, layoutVersion.value);
    layoutVersion.value = saved.version;
    savedWidgets.value = [...widgets.value];
    MessagePlugin.success('仪表盘布局已保存');
  } catch (error) {
    MessagePlugin.error(errorMessage(error));
    await loadAll();
  } finally {
    savingLayout.value = false;
  }
};

const resetLayout = () => {
  widgets.value = [...DEFAULT_WIDGETS];
};

const openIncident = (id: string) => router.push(`/status/incidents/${encodeURIComponent(id)}`);
const openMaintenance = (id: string) => router.push(`/status/maintenances/${encodeURIComponent(id)}`);

onMounted(() => {
  loadAll();
});
</script>

<style lang="less" scoped>
.overview {
  display: grid;
  gap: 16px;
}

.page-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;

  h1 {
    margin: 0;
    color: var(--td-text-color-primary);
    font-size: 24px;
    line-height: 32px;
  }

  p {
    margin: 6px 0 0;
    color: var(--td-text-color-secondary);
  }
}

.state-panel {
  display: grid;
  min-height: 240px;
  place-items: center;
}

.widget-list {
  display: grid;
  gap: 16px;
}

.widget-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  h2 {
    margin: 0;
    font-size: 16px;
    line-height: 24px;
  }
}

.count-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    display: grid;
    gap: 6px;
  }

  strong {
    font-size: 28px;
    line-height: 36px;
  }

  span {
    color: var(--td-text-color-secondary);
  }
}

.meta-list,
.plain-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.meta-list div {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
}

.plain-list li {
  display: grid;
  gap: 4px;
}

.plain-list span,
.meta-list dt {
  color: var(--td-text-color-secondary);
}

.meta-list dd {
  margin: 0;
}

.title-link {
  padding: 0;
  color: var(--td-brand-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;

  &:hover {
    text-decoration: underline;
  }
}

@media (width <= 768px) {
  .page-header {
    flex-direction: column;
  }

  .count-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
