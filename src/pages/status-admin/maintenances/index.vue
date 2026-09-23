<template>
  <main class="maintenance-admin" aria-labelledby="maintenance-admin-title">
    <header class="page-header">
      <div>
        <h1 id="maintenance-admin-title">维护计划</h1>
        <p>安排维护窗口、跟踪进度并控制公开发布。</p>
      </div>
      <t-button theme="primary" :disabled="writeDisabled" @click="openCreate">新建维护</t-button>
    </header>

    <t-alert
      v-if="!canWrite"
      theme="info"
      title="只读模式"
      message="当前账号仅可查看维护计划，写入与发布操作已禁用。"
    />
    <t-alert
      v-if="!isOnline"
      theme="warning"
      title="当前处于离线状态"
      message="列表仍可浏览，恢复联网前不能创建、发布或删除维护计划。"
    />

    <t-card :bordered="false">
      <form class="filters" aria-label="维护计划筛选" @submit.prevent="applyFilters">
        <label class="filter-field filter-search">
          <span>搜索</span>
          <t-input v-model="filterForm.search" clearable placeholder="维护标题" aria-label="搜索维护标题" />
        </label>
        <label class="filter-field">
          <span>维护状态</span>
          <t-select
            v-model="filterForm.status"
            clearable
            placeholder="全部状态"
            :options="statusOptions"
            aria-label="按维护状态筛选"
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
        <t-loading text="正在加载维护计划" />
      </div>
      <div v-else-if="loadError" class="state-panel" role="alert">
        <t-alert theme="error" title="维护计划加载失败" :message="loadError">
          <template #operation>
            <t-button variant="text" @click="loadMaintenances()">重试</t-button>
          </template>
        </t-alert>
      </div>
      <t-empty v-else-if="maintenances.length === 0" description="没有符合条件的维护计划" />
      <template v-else>
        <div class="desktop-list">
          <t-table
            row-key="id"
            :data="maintenances"
            :columns="columns"
            :hover="true"
            table-layout="fixed"
            aria-label="维护计划列表"
          >
            <template #title="{ row }">
              <button class="title-link" type="button" @click="openDetail(row.id)">
                {{ row.title }}
              </button>
            </template>
            <template #status="{ row }">
              <t-tag :theme="maintenanceStatusTheme(row.status)" variant="light">
                {{ maintenanceStatusLabel(row.status) }}
              </t-tag>
            </template>
            <template #publication="{ row }">
              <t-tag :theme="row.publishState === 'published' ? 'success' : 'default'" variant="light">
                {{ row.publishState === 'published' ? '已发布' : '草稿' }}
              </t-tag>
            </template>
            <template #window="{ row }">
              <div class="window-cell">
                <time :datetime="new Date(row.scheduledStart).toISOString()">
                  {{ formatTime(row.scheduledStart) }}
                </time>
                <span>至</span>
                <time :datetime="new Date(row.scheduledEnd).toISOString()">
                  {{ formatTime(row.scheduledEnd) }}
                </time>
              </div>
            </template>
            <template #progress="{ row }">
              <t-progress :percentage="row.progress" size="small" />
            </template>
            <template #affected="{ row }">
              <span class="ellipsis">{{ serviceNames(row.affectedServiceIds) }}</span>
            </template>
            <template #operation="{ row }">
              <t-space>
                <t-button size="small" variant="text" :aria-label="`查看维护${row.title}`" @click="openDetail(row.id)">
                  查看
                </t-button>
                <t-button
                  v-if="row.publishState !== 'published'"
                  size="small"
                  variant="text"
                  :disabled="publishDisabled || workingId === row.id"
                  :loading="workingId === row.id"
                  :aria-label="`发布维护${row.title}`"
                  @click="publishMaintenance(row)"
                >
                  发布
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="text"
                  :disabled="writeDisabled || workingId === row.id"
                  :loading="workingId === row.id"
                  :aria-label="`删除维护${row.title}`"
                  @click="removeMaintenance(row)"
                >
                  删除
                </t-button>
              </t-space>
            </template>
          </t-table>
        </div>

        <ul class="mobile-list" aria-label="维护计划列表">
          <li v-for="maintenance in maintenances" :key="maintenance.id" class="event-card">
            <article>
              <header>
                <div>
                  <h2>{{ maintenance.title }}</h2>
                  <span>{{ formatWindow(maintenance.scheduledStart, maintenance.scheduledEnd) }}</span>
                </div>
                <t-tag :theme="maintenanceStatusTheme(maintenance.status)" variant="light">
                  {{ maintenanceStatusLabel(maintenance.status) }}
                </t-tag>
              </header>
              <div class="tag-row">
                <t-tag :theme="maintenance.publishState === 'published' ? 'success' : 'default'" variant="light">
                  {{ maintenance.publishState === 'published' ? '已发布' : '草稿' }}
                </t-tag>
              </div>
              <t-progress :percentage="maintenance.progress" />
              <dl>
                <div>
                  <dt>受影响服务</dt>
                  <dd>{{ serviceNames(maintenance.affectedServiceIds) }}</dd>
                </div>
                <div>
                  <dt>时间线</dt>
                  <dd>{{ maintenance.updates.length }} 条进展</dd>
                </div>
              </dl>
              <footer>
                <t-button variant="outline" size="small" @click="openDetail(maintenance.id)"> 查看详情 </t-button>
                <t-button
                  v-if="maintenance.publishState !== 'published'"
                  variant="outline"
                  size="small"
                  :disabled="publishDisabled || workingId === maintenance.id"
                  :loading="workingId === maintenance.id"
                  :aria-label="`发布维护${maintenance.title}`"
                  @click="publishMaintenance(maintenance)"
                >
                  发布
                </t-button>
                <t-button
                  theme="danger"
                  variant="outline"
                  size="small"
                  :disabled="writeDisabled || workingId === maintenance.id"
                  :loading="workingId === maintenance.id"
                  :aria-label="`删除维护${maintenance.title}`"
                  @click="removeMaintenance(maintenance)"
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
      header="新建维护计划"
      :width="660"
      :footer="false"
      :close-on-overlay-click="!creating"
    >
      <t-form :data="createForm" :rules="createRules" :label-width="110" @submit="submitCreate">
        <t-alert
          v-if="createWindowError"
          class="dialog-alert"
          theme="error"
          title="维护窗口无效"
          :message="createWindowError"
          role="alert"
        />
        <t-form-item label="维护标题" name="title">
          <t-input v-model="createForm.title" :maxlength="200" placeholder="简明说明维护目标" :disabled="creating" />
        </t-form-item>
        <t-form-item label="维护说明" name="description">
          <t-textarea
            v-model="createForm.description"
            :maxlength="5000"
            :autosize="{ minRows: 3, maxRows: 8 }"
            placeholder="说明范围、风险和预期影响"
            :disabled="creating"
          />
        </t-form-item>
        <t-form-item label="开始时间" name="scheduledStart">
          <t-date-picker
            v-model="createForm.scheduledStart"
            enable-time-picker
            value-type="time-stamp"
            :disabled="creating"
            aria-label="选择维护开始时间"
          />
        </t-form-item>
        <t-form-item label="结束时间" name="scheduledEnd">
          <t-date-picker
            v-model="createForm.scheduledEnd"
            enable-time-picker
            value-type="time-stamp"
            :disabled="creating"
            aria-label="选择维护结束时间"
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
            aria-label="选择维护影响服务"
          />
        </t-form-item>
        <t-form-item label="首条公告" name="body">
          <t-textarea
            v-model="createForm.body"
            :maxlength="10000"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder="说明计划安排和用户注意事项"
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
  name: 'StatusMaintenances',
};
</script>

<script setup lang="ts">
import dayjs from 'dayjs';
import { MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { type AdminListQuery, type AdminMaintenance, type AdminService, adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_THEME } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { MaintenanceStatus } from '@/types/status';

interface PaginationChangeContext {
  current: number;
  pageSize: number;
}

const router = useRouter();
const userStore = useUserStore();
const maintenances = ref<AdminMaintenance[]>([]);
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
const createWindowError = ref('');

const emptyFilters = () => ({
  search: '',
  status: '' as MaintenanceStatus | '',
  publishState: '' as '' | 'draft' | 'published',
  serviceId: '',
});

const filterForm = reactive(emptyFilters());
const activeFilters = ref(emptyFilters());
const createForm = reactive({
  title: '',
  description: '',
  scheduledStart: Date.now() + 60 * 60 * 1000,
  scheduledEnd: Date.now() + 3 * 60 * 60 * 1000,
  affectedServiceIds: [] as string[],
  body: '',
});

const statusOptions = (Object.keys(MAINTENANCE_STATUS_LABEL) as MaintenanceStatus[]).map((value) => ({
  label: MAINTENANCE_STATUS_LABEL[value],
  value,
}));
const maintenanceStatusLabel = (status: MaintenanceStatus) => MAINTENANCE_STATUS_LABEL[status];
const maintenanceStatusTheme = (status: MaintenanceStatus) => MAINTENANCE_STATUS_THEME[status];

const publishOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
];

const columns = [
  { colKey: 'title', title: '维护标题', minWidth: 180 },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'publication', title: '发布', width: 90 },
  { colKey: 'window', title: '维护窗口', width: 180 },
  { colKey: 'progress', title: '进度', width: 150 },
  { colKey: 'affected', title: '受影响服务', minWidth: 140 },
  { colKey: 'operation', title: '操作', width: 180 },
];

const createRules = {
  title: [{ required: true, message: '请输入维护标题', type: 'error' as const }],
  scheduledStart: [{ required: true, message: '请选择开始时间', type: 'error' as const }],
  scheduledEnd: [{ required: true, message: '请选择结束时间', type: 'error' as const }],
  body: [{ required: true, message: '请输入首条公告', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('maintenance:write'));
const canPublish = computed(() => canWrite.value && userStore.permissions.includes('publish'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const publishDisabled = computed(() => !canPublish.value || !isOnline.value);
const serviceOptions = computed(() => services.value.map((service) => ({ label: service.name, value: service.id })));
const serviceNameMap = computed(() => new Map(services.value.map((service) => [service.id, service.name])));

const formatTime = (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm');
const formatWindow = (start: number, end: number) => `${formatTime(start)} 至 ${formatTime(end)}`;
const serviceNames = (ids: string[]) => ids.map((id) => serviceNameMap.value.get(id) || id).join('、') || '未指定';
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const listQuery = (): AdminListQuery => ({
  page: page.value,
  pageSize: pageSize.value,
  search: activeFilters.value.search || undefined,
  status: activeFilters.value.status || undefined,
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

const loadMaintenances = async (targetPage = page.value) => {
  page.value = targetPage;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminStatusApi.maintenances.list(listQuery());
    maintenances.value = result.items;
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
  loadMaintenances(1);
};

const clearFilters = () => {
  Object.assign(filterForm, emptyFilters());
  activeFilters.value = emptyFilters();
  loadMaintenances(1);
};

const onPaginationChange = (context: PaginationChangeContext) => {
  pageSize.value = context.pageSize;
  loadMaintenances(context.current);
};

const openDetail = (id: string) => {
  router.push(`/status/maintenances/${encodeURIComponent(id)}`);
};

const resetCreateForm = () => {
  createForm.title = '';
  createForm.description = '';
  createForm.scheduledStart = Date.now() + 60 * 60 * 1000;
  createForm.scheduledEnd = Date.now() + 3 * 60 * 60 * 1000;
  createForm.affectedServiceIds = [];
  createForm.body = '';
  createMode.value = 'draft';
  createWindowError.value = '';
};

const openCreate = () => {
  if (writeDisabled.value) return;
  resetCreateForm();
  createVisible.value = true;
};

const submitCreate = async (context: SubmitContext) => {
  if (context.validateResult !== true || writeDisabled.value) return;
  if (createMode.value === 'publish' && publishDisabled.value) return;
  const start = Number(createForm.scheduledStart);
  const end = Number(createForm.scheduledEnd);
  if (end <= start) {
    createWindowError.value = '结束时间必须晚于开始时间。';
    return;
  }
  createWindowError.value = '';
  creating.value = true;
  let created: AdminMaintenance | null = null;
  try {
    created = await adminStatusApi.maintenances.create({
      title: createForm.title.trim(),
      description: createForm.description.trim() || undefined,
      scheduledStart: start,
      scheduledEnd: end,
      affectedServiceIds: [...createForm.affectedServiceIds],
      body: createForm.body.trim(),
    });
    if (createMode.value === 'publish') {
      created = await adminStatusApi.maintenances.publish(created.id, created.version);
    }
    createVisible.value = false;
    MessagePlugin.success(createMode.value === 'publish' ? '维护计划已创建并发布' : '维护草稿已创建');
    await loadMaintenances(1);
  } catch (error) {
    if (created && createMode.value === 'publish') {
      createVisible.value = false;
      MessagePlugin.error(`草稿已创建，但发布失败：${errorMessage(error)}`);
      await loadMaintenances(1);
    } else {
      MessagePlugin.error(errorMessage(error));
    }
  } finally {
    creating.value = false;
  }
};

const replaceMaintenance = (updated: AdminMaintenance) => {
  const index = maintenances.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) maintenances.value.splice(index, 1, updated);
};

const handleMutationError = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突：该维护计划已被其他用户修改，列表已刷新。');
    await loadMaintenances();
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const publishMaintenance = async (maintenance: AdminMaintenance) => {
  if (publishDisabled.value) return;
  workingId.value = maintenance.id;
  try {
    const updated = await adminStatusApi.maintenances.publish(maintenance.id, maintenance.version);
    replaceMaintenance(updated);
    MessagePlugin.success('维护计划已发布');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    workingId.value = '';
  }
};

const removeMaintenance = async (maintenance: AdminMaintenance) => {
  if (writeDisabled.value) return;
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(
    `确定软删除维护“${maintenance.title}”吗？\n\n维护窗口：${formatWindow(
      maintenance.scheduledStart,
      maintenance.scheduledEnd,
    )}\n影响服务：${serviceNames(maintenance.affectedServiceIds)}\n时间线：${
      maintenance.updates.length
    } 条\n\n删除后公开状态页将不再展示该维护。`,
  );
  if (!confirmed) return;
  workingId.value = maintenance.id;
  try {
    await adminStatusApi.maintenances.remove(maintenance.id, maintenance.version);
    MessagePlugin.success('维护计划已删除');
    const targetPage = maintenances.value.length === 1 && page.value > 1 ? page.value - 1 : page.value;
    await loadMaintenances(targetPage);
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
  Promise.all([loadServices(), loadMaintenances()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});
</script>

<style lang="less" scoped>
.maintenance-admin {
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
  grid-template-columns: minmax(220px, 1.6fr) repeat(3, minmax(150px, 1fr)) auto;
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

.dialog-alert {
  margin-bottom: 16px;
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

.window-cell {
  display: grid;
  gap: 2px;
  font-size: 13px;

  span {
    color: var(--td-text-color-placeholder);
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

  header span {
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

@media (width <= 1100px) {
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
