<template>
  <main class="incident-admin" aria-labelledby="incident-admin-title">
    <header class="page-header">
      <div>
        <h1 id="incident-admin-title">事件管理</h1>
        <p>创建事件草稿、筛选历史事件并控制公开发布。</p>
      </div>
      <t-button theme="primary" :disabled="writeDisabled" @click="openCreate">新建事件</t-button>
    </header>

    <t-alert v-if="!canWrite" theme="info" title="只读模式" message="当前账号仅可查看事件，写入与发布操作已禁用。" />
    <t-alert
      v-if="!isOnline"
      theme="warning"
      title="当前处于离线状态"
      message="列表仍可浏览，恢复联网前不能创建、发布或删除事件。"
    />

    <t-card :bordered="false">
      <form class="filters" aria-label="事件筛选" @submit.prevent="applyFilters">
        <label class="filter-field filter-search">
          <span>搜索</span>
          <t-input v-model="filterForm.search" clearable placeholder="事件标题" aria-label="搜索事件标题" />
        </label>
        <label class="filter-field">
          <span>事件状态</span>
          <t-select
            v-model="filterForm.status"
            clearable
            placeholder="全部状态"
            :options="statusOptions"
            aria-label="按事件状态筛选"
          />
        </label>
        <label class="filter-field">
          <span>影响级别</span>
          <t-select
            v-model="filterForm.impact"
            clearable
            placeholder="全部级别"
            :options="impactOptions"
            aria-label="按影响级别筛选"
          />
        </label>
        <label class="filter-field">
          <span>发布状态</span>
          <t-select
            v-model="filterForm.publishState"
            clearable
            placeholder="全部"
            :options="publishOptions"
            aria-label="按发布状态筛选"
          />
        </label>
        <label class="filter-field">
          <span>受影响服务</span>
          <t-select
            v-model="filterForm.serviceId"
            clearable
            filterable
            placeholder="全部服务"
            :options="serviceOptions"
            aria-label="按受影响服务筛选"
          />
        </label>
        <div class="filter-actions">
          <t-button theme="primary" type="submit">查询</t-button>
          <t-button variant="outline" type="button" @click="clearFilters">清除</t-button>
        </div>
      </form>

      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载事件" />
      </div>
      <div v-else-if="loadError" class="state-panel" role="alert">
        <t-alert theme="error" title="事件加载失败" :message="loadError">
          <template #operation>
            <t-button variant="text" @click="loadIncidents()">重试</t-button>
          </template>
        </t-alert>
      </div>
      <t-empty v-else-if="incidents.length === 0" description="没有符合条件的事件" />
      <template v-else>
        <div class="desktop-list">
          <t-table
            row-key="id"
            :data="incidents"
            :columns="columns"
            :hover="true"
            table-layout="fixed"
            aria-label="事件列表"
          >
            <template #title="{ row }">
              <button class="title-link" type="button" @click="openDetail(row.id)">
                {{ row.title }}
              </button>
            </template>
            <template #impact="{ row }">
              <t-tag :theme="incidentImpactTheme(row.impact)" variant="light">
                {{ incidentImpactLabel(row.impact) }}
              </t-tag>
            </template>
            <template #status="{ row }">
              <t-tag variant="light">{{ incidentStatusLabel(row.status) }}</t-tag>
            </template>
            <template #publication="{ row }">
              <t-tag :theme="row.publishState === 'published' ? 'success' : 'default'" variant="light">
                {{ row.publishState === 'published' ? '已发布' : '草稿' }}
              </t-tag>
            </template>
            <template #affected="{ row }">
              <span class="ellipsis">{{ serviceNames(row.affectedServiceIds) }}</span>
            </template>
            <template #startedAt="{ row }">{{ formatTime(row.startedAt) }}</template>
            <template #operation="{ row }">
              <t-space>
                <t-button size="small" variant="text" :aria-label="`查看事件${row.title}`" @click="openDetail(row.id)">
                  查看
                </t-button>
                <t-button
                  v-if="row.publishState !== 'published'"
                  size="small"
                  variant="text"
                  :disabled="publishDisabled || workingId === row.id"
                  :loading="workingId === row.id"
                  :aria-label="`发布事件${row.title}`"
                  @click="publishIncident(row)"
                >
                  发布
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="text"
                  :disabled="writeDisabled || workingId === row.id"
                  :loading="workingId === row.id"
                  :aria-label="`删除事件${row.title}`"
                  @click="removeIncident(row)"
                >
                  删除
                </t-button>
              </t-space>
            </template>
          </t-table>
        </div>

        <ul class="mobile-list" aria-label="事件列表">
          <li v-for="incident in incidents" :key="incident.id" class="event-card">
            <article>
              <header>
                <div>
                  <h2>{{ incident.title }}</h2>
                  <time :datetime="new Date(incident.startedAt).toISOString()">
                    {{ formatTime(incident.startedAt) }}
                  </time>
                </div>
                <t-tag :theme="incidentImpactTheme(incident.impact)" variant="light">
                  {{ incidentImpactLabel(incident.impact) }}
                </t-tag>
              </header>
              <div class="tag-row">
                <t-tag variant="light">{{ incidentStatusLabel(incident.status) }}</t-tag>
                <t-tag :theme="incident.publishState === 'published' ? 'success' : 'default'" variant="light">
                  {{ incident.publishState === 'published' ? '已发布' : '草稿' }}
                </t-tag>
              </div>
              <dl>
                <div>
                  <dt>受影响服务</dt>
                  <dd>{{ serviceNames(incident.affectedServiceIds) }}</dd>
                </div>
                <div>
                  <dt>时间线</dt>
                  <dd>{{ incident.updates.length }} 条进展</dd>
                </div>
              </dl>
              <footer>
                <t-button variant="outline" size="small" @click="openDetail(incident.id)"> 查看详情 </t-button>
                <t-button
                  v-if="incident.publishState !== 'published'"
                  variant="outline"
                  size="small"
                  :disabled="publishDisabled || workingId === incident.id"
                  :loading="workingId === incident.id"
                  :aria-label="`发布事件${incident.title}`"
                  @click="publishIncident(incident)"
                >
                  发布
                </t-button>
                <t-button
                  theme="danger"
                  variant="outline"
                  size="small"
                  :disabled="writeDisabled || workingId === incident.id"
                  :loading="workingId === incident.id"
                  :aria-label="`删除事件${incident.title}`"
                  @click="removeIncident(incident)"
                >
                  删除
                </t-button>
              </footer>
            </article>
          </li>
        </ul>
      </template>

      <t-pagination
        v-if="!loading && !loadError && total > 0"
        class="pagination"
        :current="page"
        :page-size="pageSize"
        :total="total"
        :page-size-options="[10, 20, 50, 100]"
        show-jumper
        @change="onPaginationChange"
      />
    </t-card>

    <t-dialog
      v-model:visible="createVisible"
      header="新建事件"
      :width="640"
      :footer="false"
      :close-on-overlay-click="!creating"
    >
      <t-form :data="createForm" :rules="createRules" :label-width="110" @submit="submitCreate">
        <t-form-item label="事件标题" name="title">
          <t-input
            v-model="createForm.title"
            :maxlength="200"
            placeholder="简明说明用户可感知的问题"
            :disabled="creating"
          />
        </t-form-item>
        <t-form-item label="影响级别" name="impact">
          <t-select
            v-model="createForm.impact"
            :options="impactOptions"
            :disabled="creating"
            aria-label="选择事件影响级别"
          />
        </t-form-item>
        <t-form-item label="开始时间" name="startedAt">
          <t-date-picker
            v-model="createForm.startedAt"
            enable-time-picker
            value-type="time-stamp"
            :disabled="creating"
            aria-label="选择事件开始时间"
          />
        </t-form-item>
        <t-form-item label="影响服务" name="affectedServiceIds">
          <t-select
            v-model="createForm.affectedServiceIds"
            multiple
            filterable
            clearable
            :options="serviceOptions"
            :disabled="creating"
            placeholder="可选择多个服务"
            aria-label="选择受影响服务"
          />
        </t-form-item>
        <t-form-item label="首条进展" name="body">
          <t-textarea
            v-model="createForm.body"
            :maxlength="10000"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder="说明当前现象、影响和正在采取的措施"
            :disabled="creating"
          />
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button
              theme="primary"
              type="submit"
              :loading="creating"
              :disabled="writeDisabled"
              @click="createMode = 'draft'"
            >
              保存草稿
            </t-button>
            <t-button
              v-if="canPublish"
              theme="success"
              type="submit"
              :loading="creating"
              :disabled="publishDisabled"
              @click="createMode = 'publish'"
            >
              保存并发布
            </t-button>
            <t-button type="button" variant="outline" :disabled="creating" @click="createVisible = false">
              取消
            </t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-dialog>
  </main>
</template>

<script lang="ts">
export default {
  name: 'StatusIncidents',
};
</script>

<script setup lang="ts">
import dayjs from 'dayjs';
import { MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { type AdminIncident, type AdminListQuery, type AdminService, adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { INCIDENT_IMPACT_LABEL, INCIDENT_IMPACT_THEME, INCIDENT_STATUS_LABEL } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { IncidentImpact, IncidentStatus } from '@/types/status';

interface PaginationChangeContext {
  current: number;
  pageSize: number;
}

const router = useRouter();
const userStore = useUserStore();
const incidents = ref<AdminIncident[]>([]);
const services = ref<AdminService[]>([]);
const loading = ref(true);
const loadError = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const workingId = ref('');
const isOnline = ref(navigator.onLine);
const createVisible = ref(false);
const creating = ref(false);
const createMode = ref<'draft' | 'publish'>('draft');

const emptyFilters = () => ({
  search: '',
  status: '' as IncidentStatus | '',
  impact: '' as IncidentImpact | '',
  publishState: '' as '' | 'draft' | 'published',
  serviceId: '',
});

const filterForm = reactive(emptyFilters());
const activeFilters = ref(emptyFilters());
const createForm = reactive({
  title: '',
  impact: 'minor' as IncidentImpact,
  startedAt: Date.now(),
  affectedServiceIds: [] as string[],
  body: '',
});

const statusOptions = (Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((value) => ({
  label: INCIDENT_STATUS_LABEL[value],
  value,
}));

const impactOptions = (Object.keys(INCIDENT_IMPACT_LABEL) as IncidentImpact[]).map((value) => ({
  label: INCIDENT_IMPACT_LABEL[value],
  value,
}));
const incidentImpactLabel = (impact: IncidentImpact) => INCIDENT_IMPACT_LABEL[impact];
const incidentImpactTheme = (impact: IncidentImpact) => INCIDENT_IMPACT_THEME[impact];
const incidentStatusLabel = (status: IncidentStatus) => INCIDENT_STATUS_LABEL[status];

const publishOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
];

const columns = [
  { colKey: 'title', title: '事件标题', minWidth: 190 },
  { colKey: 'impact', title: '影响', width: 90 },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'publication', title: '发布', width: 90 },
  { colKey: 'affected', title: '受影响服务', minWidth: 150 },
  { colKey: 'startedAt', title: '开始时间', width: 170 },
  { colKey: 'operation', title: '操作', width: 180 },
];

const createRules = {
  title: [{ required: true, message: '请输入事件标题', type: 'error' as const }],
  impact: [{ required: true, message: '请选择影响级别', type: 'error' as const }],
  startedAt: [{ required: true, message: '请选择开始时间', type: 'error' as const }],
  body: [{ required: true, message: '请输入首条进展', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('incident:write'));
const canPublish = computed(() => canWrite.value && userStore.permissions.includes('publish'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const publishDisabled = computed(() => !canPublish.value || !isOnline.value);
const serviceOptions = computed(() => services.value.map((service) => ({ label: service.name, value: service.id })));
const serviceNameMap = computed(() => new Map(services.value.map((service) => [service.id, service.name])));

const formatTime = (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm');
const serviceNames = (ids: string[]) => ids.map((id) => serviceNameMap.value.get(id) || id).join('、') || '未指定';
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const listQuery = (): AdminListQuery => ({
  page: page.value,
  pageSize: pageSize.value,
  search: activeFilters.value.search || undefined,
  status: activeFilters.value.status || undefined,
  impact: activeFilters.value.impact || undefined,
  publishState: activeFilters.value.publishState || undefined,
  serviceId: activeFilters.value.serviceId || undefined,
});

const loadServices = async () => {
  try {
    const result = await adminStatusApi.services.list();
    services.value = result.items;
  } catch {
    services.value = [];
  }
};

const loadIncidents = async (targetPage = page.value) => {
  page.value = targetPage;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminStatusApi.incidents.list(listQuery());
    incidents.value = result.items;
    total.value = result.pagination?.total ?? result.total ?? result.items.length;
    if (result.pagination) {
      page.value = result.pagination.page;
      pageSize.value = result.pagination.pageSize;
    }
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  activeFilters.value = { ...filterForm };
  loadIncidents(1);
};

const clearFilters = () => {
  Object.assign(filterForm, emptyFilters());
  activeFilters.value = emptyFilters();
  loadIncidents(1);
};

const onPaginationChange = (context: PaginationChangeContext) => {
  pageSize.value = context.pageSize;
  loadIncidents(context.current);
};

const openDetail = (id: string) => {
  router.push(`/status/incidents/${encodeURIComponent(id)}`);
};

const resetCreateForm = () => {
  createForm.title = '';
  createForm.impact = 'minor';
  createForm.startedAt = Date.now();
  createForm.affectedServiceIds = [];
  createForm.body = '';
  createMode.value = 'draft';
};

const openCreate = () => {
  if (writeDisabled.value) return;
  resetCreateForm();
  createVisible.value = true;
};

const submitCreate = async (context: SubmitContext) => {
  if (context.validateResult !== true || writeDisabled.value) return;
  if (createMode.value === 'publish' && publishDisabled.value) return;
  creating.value = true;
  let created: AdminIncident | null = null;
  try {
    created = await adminStatusApi.incidents.create({
      title: createForm.title.trim(),
      impact: createForm.impact,
      startedAt: Number(createForm.startedAt),
      affectedServiceIds: [...createForm.affectedServiceIds],
      body: createForm.body.trim(),
    });
    if (createMode.value === 'publish') {
      created = await adminStatusApi.incidents.publish(created.id, created.version);
    }
    createVisible.value = false;
    MessagePlugin.success(createMode.value === 'publish' ? '事件已创建并发布' : '事件草稿已创建');
    await loadIncidents(1);
  } catch (error) {
    if (created && createMode.value === 'publish') {
      createVisible.value = false;
      MessagePlugin.error(`草稿已创建，但发布失败：${errorMessage(error)}`);
      await loadIncidents(1);
    } else {
      MessagePlugin.error(errorMessage(error));
    }
  } finally {
    creating.value = false;
  }
};

const replaceIncident = (updated: AdminIncident) => {
  const index = incidents.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) incidents.value.splice(index, 1, updated);
};

const handleMutationError = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突：该事件已被其他用户修改，列表已刷新。');
    await loadIncidents();
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const publishIncident = async (incident: AdminIncident) => {
  if (publishDisabled.value) return;
  workingId.value = incident.id;
  try {
    const updated = await adminStatusApi.incidents.publish(incident.id, incident.version);
    replaceIncident(updated);
    MessagePlugin.success('事件已发布');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    workingId.value = '';
  }
};

const removeIncident = async (incident: AdminIncident) => {
  if (writeDisabled.value) return;
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(
    `确定软删除事件“${incident.title}”吗？\n\n状态：${INCIDENT_STATUS_LABEL[incident.status]}\n影响服务：${serviceNames(
      incident.affectedServiceIds,
    )}\n时间线：${incident.updates.length} 条\n\n删除后公开状态页将不再展示该事件。`,
  );
  if (!confirmed) return;
  workingId.value = incident.id;
  try {
    await adminStatusApi.incidents.remove(incident.id, incident.version);
    MessagePlugin.success('事件已删除');
    const targetPage = incidents.value.length === 1 && page.value > 1 ? page.value - 1 : page.value;
    await loadIncidents(targetPage);
  } catch (error) {
    await handleMutationError(error);
  } finally {
    workingId.value = '';
  }
};

const updateOnlineState = () => {
  isOnline.value = navigator.onLine;
};

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  Promise.all([loadServices(), loadIncidents()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});
</script>

<style lang="less" scoped>
.incident-admin {
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

.filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.6fr) repeat(4, minmax(140px, 1fr)) auto;
  gap: 14px;
  align-items: end;
  margin-bottom: 20px;
}

.filter-field {
  display: grid;
  gap: 6px;
  color: var(--td-text-color-secondary);
  font-size: 14px;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.state-panel {
  display: grid;
  min-height: 260px;
  place-items: center;
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

  &:focus-visible {
    outline: 2px solid var(--td-brand-color);
    outline-offset: 2px;
  }
}

.ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.mobile-list {
  display: none;
  padding: 0;
  margin: 0;
  list-style: none;
}

.event-card {
  padding: 16px 0;
  border-bottom: 1px solid var(--td-component-stroke);

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  article {
    display: grid;
    gap: 12px;
  }

  header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  h2 {
    margin: 0 0 5px;
    font-size: 17px;
    line-height: 24px;
  }

  time {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }

  dl {
    display: grid;
    gap: 10px;
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: 88px 1fr;
    gap: 8px;
  }

  dt {
    color: var(--td-text-color-placeholder);
  }

  dd {
    margin: 0;
    word-break: break-word;
  }

  footer,
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media (width <= 1280px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (width <= 768px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .desktop-list {
    display: none;
  }

  .mobile-list {
    display: block;
  }

  .pagination {
    justify-content: center;
    overflow-x: auto;
  }
}
</style>
