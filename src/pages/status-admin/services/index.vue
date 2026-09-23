<template>
  <main class="service-admin" aria-labelledby="service-admin-title">
    <header class="page-header">
      <div>
        <h1 id="service-admin-title">服务管理</h1>
        <p>维护公开组件、人工运行状态与展示顺序。</p>
      </div>
      <t-button theme="primary" :disabled="writeDisabled" @click="openCreate">新建服务</t-button>
    </header>

    <t-alert
      v-if="!canWrite"
      class="page-alert"
      theme="info"
      title="只读模式"
      message="当前账号仅可查看服务，创建、编辑、排序和删除操作已禁用。"
    />
    <t-alert
      v-if="!isOnline"
      class="page-alert"
      theme="warning"
      title="当前处于离线状态"
      message="为避免产生未同步的修改，所有写操作已禁用。"
    />
    <legacy-status-import />

    <t-card :bordered="false">
      <form class="filters" aria-label="服务筛选" @submit.prevent>
        <label class="filter-field">
          <span>搜索</span>
          <t-input v-model="filters.search" clearable placeholder="服务名称、标识或描述" aria-label="搜索服务" />
        </label>
        <label class="filter-field">
          <span>运行状态</span>
          <t-select
            v-model="filters.status"
            clearable
            placeholder="全部状态"
            :options="statusOptions"
            aria-label="按运行状态筛选"
          />
        </label>
        <label class="filter-field">
          <span>公开状态</span>
          <t-select
            v-model="filters.enabled"
            clearable
            placeholder="全部"
            :options="enabledOptions"
            aria-label="按公开状态筛选"
          />
        </label>
        <div class="filter-actions">
          <t-button variant="outline" type="button" @click="resetFilters">清除筛选</t-button>
          <span aria-live="polite">共 {{ filteredServices.length }} 项</span>
        </div>
      </form>

      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载服务" />
      </div>
      <div v-else-if="loadError" class="state-panel" role="alert">
        <t-alert theme="error" title="服务加载失败" :message="loadError">
          <template #operation>
            <t-button variant="text" @click="loadServices">重试</t-button>
          </template>
        </t-alert>
      </div>
      <t-empty v-else-if="filteredServices.length === 0" description="没有符合条件的服务" />
      <template v-else>
        <div class="desktop-list">
          <t-table
            row-key="id"
            :data="filteredServices"
            :columns="columns"
            :hover="true"
            table-layout="fixed"
            aria-label="服务列表"
          >
            <template #service="{ row }">
              <div class="service-name">
                <strong>{{ row.name }}</strong>
                <code>{{ row.slug }}</code>
              </div>
            </template>
            <template #status="{ row }">
              <t-tag :theme="serviceStatusTheme(row.status)" variant="light">
                {{ serviceStatusLabel(row.status) }}
              </t-tag>
            </template>
            <template #enabled="{ row }">
              <t-switch
                :value="row.enabled"
                :disabled="writeDisabled || isWorking(row.id)"
                :aria-label="`${row.name}公开展示`"
                @change="(value: boolean) => updateVisibility(row, Boolean(value))"
              />
            </template>
            <template #health="{ row }">
              <span>{{ row.uptime.toFixed(2) }}%</span>
              <small>{{ row.latencyMs }} ms</small>
            </template>
            <template #order="{ row }">
              <div class="order-actions">
                <span>第 {{ globalIndex(row.id) + 1 }} 位</span>
                <t-button
                  size="small"
                  variant="text"
                  :disabled="writeDisabled || isWorking(row.id) || globalIndex(row.id) <= 0"
                  :aria-label="`上移服务${row.name}`"
                  @click="moveService(row, -1)"
                >
                  上移
                </t-button>
                <t-button
                  size="small"
                  variant="text"
                  :disabled="writeDisabled || isWorking(row.id) || globalIndex(row.id) >= orderedServices.length - 1"
                  :aria-label="`下移服务${row.name}`"
                  @click="moveService(row, 1)"
                >
                  下移
                </t-button>
              </div>
            </template>
            <template #operation="{ row }">
              <t-space>
                <t-button
                  size="small"
                  variant="text"
                  :disabled="writeDisabled || isWorking(row.id)"
                  :aria-label="`编辑服务${row.name}`"
                  @click="openEdit(row)"
                >
                  编辑
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="text"
                  :loading="isWorking(row.id)"
                  :disabled="writeDisabled"
                  :aria-label="`删除服务${row.name}`"
                  @click="removeService(row)"
                >
                  删除
                </t-button>
              </t-space>
            </template>
          </t-table>
        </div>

        <ul class="mobile-list" aria-label="服务列表">
          <li v-for="service in filteredServices" :key="service.id" class="service-card">
            <article>
              <header>
                <div>
                  <h2>{{ service.name }}</h2>
                  <code>{{ service.slug }}</code>
                </div>
                <t-tag :theme="serviceStatusTheme(service.status)" variant="light">
                  {{ serviceStatusLabel(service.status) }}
                </t-tag>
              </header>
              <p>{{ service.description || '暂无描述' }}</p>
              <dl>
                <div>
                  <dt>公开展示</dt>
                  <dd>
                    <t-switch
                      :value="service.enabled"
                      :disabled="writeDisabled || isWorking(service.id)"
                      :aria-label="`${service.name}公开展示`"
                      @change="(value: boolean) => updateVisibility(service, Boolean(value))"
                    />
                  </dd>
                </div>
                <div>
                  <dt>可用率</dt>
                  <dd>{{ service.uptime.toFixed(2) }}%</dd>
                </div>
                <div>
                  <dt>当前延迟</dt>
                  <dd>{{ service.latencyMs }} ms</dd>
                </div>
                <div>
                  <dt>展示顺序</dt>
                  <dd>第 {{ globalIndex(service.id) + 1 }} 位</dd>
                </div>
              </dl>
              <footer>
                <t-button
                  size="small"
                  variant="outline"
                  :disabled="writeDisabled || isWorking(service.id) || globalIndex(service.id) <= 0"
                  :aria-label="`上移服务${service.name}`"
                  @click="moveService(service, -1)"
                >
                  上移
                </t-button>
                <t-button
                  size="small"
                  variant="outline"
                  :disabled="
                    writeDisabled || isWorking(service.id) || globalIndex(service.id) >= orderedServices.length - 1
                  "
                  :aria-label="`下移服务${service.name}`"
                  @click="moveService(service, 1)"
                >
                  下移
                </t-button>
                <t-button
                  size="small"
                  variant="outline"
                  :disabled="writeDisabled || isWorking(service.id)"
                  :aria-label="`编辑服务${service.name}`"
                  @click="openEdit(service)"
                >
                  编辑
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="outline"
                  :loading="isWorking(service.id)"
                  :disabled="writeDisabled"
                  :aria-label="`删除服务${service.name}`"
                  @click="removeService(service)"
                >
                  删除
                </t-button>
              </footer>
            </article>
          </li>
        </ul>
      </template>
    </t-card>

    <t-dialog
      v-model:visible="dialogVisible"
      :header="editingService ? '编辑服务' : '新建服务'"
      :width="600"
      :footer="false"
      :close-on-overlay-click="!saving"
    >
      <t-form :data="formData" :rules="rules" :label-width="110" @submit="submitService">
        <t-form-item label="服务名称" name="name">
          <t-input v-model="formData.name" :maxlength="100" placeholder="例如：开放 API" :disabled="saving" />
        </t-form-item>
        <t-form-item label="唯一标识" name="slug">
          <t-input
            v-model="formData.slug"
            :maxlength="80"
            placeholder="例如：open-api"
            :disabled="saving || Boolean(editingService)"
          />
        </t-form-item>
        <t-form-item label="描述" name="description">
          <t-textarea
            v-model="formData.description"
            :maxlength="2000"
            :autosize="{ minRows: 3, maxRows: 7 }"
            placeholder="说明服务范围和用户可见信息"
            :disabled="saving"
          />
        </t-form-item>
        <t-form-item label="人工状态" name="status">
          <t-select
            v-model="formData.status"
            :options="statusOptions"
            :disabled="saving"
            aria-label="选择服务人工状态"
          />
        </t-form-item>
        <t-form-item label="公开展示" name="enabled">
          <t-switch v-model="formData.enabled" :disabled="saving" aria-label="设置服务是否公开展示" />
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button theme="primary" type="submit" :loading="saving" :disabled="writeDisabled"> 保存 </t-button>
            <t-button type="button" variant="outline" :disabled="saving" @click="dialogVisible = false">
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
  name: 'StatusServices',
};
</script>

<script setup lang="ts">
import { MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { type AdminService, type AdminServiceInput, adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_THEME } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { ServiceStatus } from '@/types/status';

import LegacyStatusImport from '../components/LegacyStatusImport.vue';

const userStore = useUserStore();
const services = ref<AdminService[]>([]);
const loading = ref(true);
const loadError = ref('');
const workingIds = ref<string[]>([]);
const isOnline = ref(navigator.onLine);
const dialogVisible = ref(false);
const editingService = ref<AdminService | null>(null);
const saving = ref(false);

const filters = reactive({
  search: '',
  status: '' as ServiceStatus | '',
  enabled: '' as '' | 'true' | 'false',
});

const formData = reactive<AdminServiceInput>({
  slug: '',
  name: '',
  description: '',
  status: 'up',
  enabled: true,
});

const statusOptions = (Object.keys(SERVICE_STATUS_LABEL) as ServiceStatus[]).map((value) => ({
  label: SERVICE_STATUS_LABEL[value],
  value,
}));
const serviceStatusLabel = (status: ServiceStatus) => SERVICE_STATUS_LABEL[status];
const serviceStatusTheme = (status: ServiceStatus) => SERVICE_STATUS_THEME[status];

const enabledOptions = [
  { label: '已公开', value: 'true' },
  { label: '未公开', value: 'false' },
];

const columns = [
  { colKey: 'service', title: '服务', width: 190 },
  { colKey: 'description', title: '描述', ellipsis: true },
  { colKey: 'status', title: '人工状态', width: 100 },
  { colKey: 'enabled', title: '公开', width: 80 },
  { colKey: 'health', title: '健康指标', width: 110 },
  { colKey: 'order', title: '顺序', width: 190 },
  { colKey: 'operation', title: '操作', width: 130 },
];

const rules = {
  name: [{ required: true, message: '请输入服务名称', type: 'error' as const }],
  slug: [{ required: true, message: '请输入唯一标识', type: 'error' as const }],
  status: [{ required: true, message: '请选择人工状态', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('service:write'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const orderedServices = computed(() => [...services.value].sort((left, right) => left.position - right.position));
const filteredServices = computed(() => {
  const keyword = filters.search.trim().toLocaleLowerCase('zh-CN');
  return orderedServices.value.filter((service) => {
    const matchesKeyword =
      !keyword ||
      [service.name, service.slug, service.description || ''].some((value) =>
        value.toLocaleLowerCase('zh-CN').includes(keyword),
      );
    const matchesStatus = !filters.status || service.status === filters.status;
    const matchesEnabled = !filters.enabled || service.enabled === (filters.enabled === 'true');
    return matchesKeyword && matchesStatus && matchesEnabled;
  });
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const handleMutationError = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突：该服务已被其他用户修改，列表已刷新。');
    await loadServices();
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const setWorking = (id: string, value: boolean) => {
  workingIds.value = value ? [...new Set([...workingIds.value, id])] : workingIds.value.filter((item) => item !== id);
};

const isWorking = (id: string) => workingIds.value.includes(id);
const globalIndex = (id: string) => orderedServices.value.findIndex((item) => item.id === id);

const loadServices = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminStatusApi.services.list();
    services.value = result.items;
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  filters.search = '';
  filters.status = '';
  filters.enabled = '';
};

const resetForm = () => {
  formData.slug = '';
  formData.name = '';
  formData.description = '';
  formData.status = 'up';
  formData.enabled = true;
};

const openCreate = () => {
  if (writeDisabled.value) return;
  editingService.value = null;
  resetForm();
  dialogVisible.value = true;
};

const openEdit = (service: AdminService) => {
  if (writeDisabled.value) return;
  editingService.value = service;
  formData.slug = service.slug;
  formData.name = service.name;
  formData.description = service.description || '';
  formData.status = service.status;
  formData.enabled = service.enabled;
  dialogVisible.value = true;
};

const submitService = async (context: SubmitContext) => {
  if (context.validateResult !== true || writeDisabled.value) return;
  saving.value = true;
  try {
    const payload = {
      slug: formData.slug.trim(),
      name: formData.name.trim(),
      description: formData.description?.trim() || undefined,
      status: formData.status,
      enabled: formData.enabled,
    };
    const saved = editingService.value
      ? await adminStatusApi.services.update(editingService.value.id, editingService.value.version, payload)
      : await adminStatusApi.services.create(payload);
    const existingIndex = services.value.findIndex((item) => item.id === saved.id);
    if (existingIndex >= 0) services.value.splice(existingIndex, 1, saved);
    else services.value.push(saved);
    dialogVisible.value = false;
    MessagePlugin.success(editingService.value ? '服务已更新' : '服务已创建');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    saving.value = false;
  }
};

const updateVisibility = async (service: AdminService, enabled: boolean) => {
  if (writeDisabled.value || enabled === service.enabled) return;
  setWorking(service.id, true);
  try {
    const updated = await adminStatusApi.services.update(service.id, service.version, { enabled });
    const index = services.value.findIndex((item) => item.id === service.id);
    if (index >= 0) services.value.splice(index, 1, updated);
    MessagePlugin.success(enabled ? '服务已公开' : '服务已隐藏');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    setWorking(service.id, false);
  }
};

const moveService = async (service: AdminService, offset: -1 | 1) => {
  if (writeDisabled.value) return;
  const index = globalIndex(service.id);
  const target = orderedServices.value[index + offset];
  if (!target) return;
  setWorking(service.id, true);
  setWorking(target.id, true);
  try {
    const result = await adminStatusApi.services.reorder([
      { id: service.id, version: service.version, position: target.position },
      { id: target.id, version: target.version, position: service.position },
    ]);
    services.value = result.items;
    MessagePlugin.success('展示顺序已更新');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    setWorking(service.id, false);
    setWorking(target.id, false);
  }
};

const removeService = async (service: AdminService) => {
  if (writeDisabled.value) return;
  setWorking(service.id, true);
  try {
    const references = await adminStatusApi.services.references(service.id);
    const details = [
      `关联事件 ${references.incidentCount} 条`,
      `关联维护 ${references.maintenanceCount} 条`,
      references.incidentTitles.length ? `事件示例：${references.incidentTitles.join('、')}` : '',
      references.maintenanceTitles.length ? `维护示例：${references.maintenanceTitles.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    // 浏览器确认框在危险操作前提供同步、可访问的阻断确认。
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `确定软删除服务“${service.name}”吗？\n\n${details}\n\n删除后不会出现在服务列表中，关联记录仍保留历史引用。`,
    );
    if (!confirmed) return;
    await adminStatusApi.services.remove(service.id, service.version);
    services.value = services.value.filter((item) => item.id !== service.id);
    MessagePlugin.success('服务已删除');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    setWorking(service.id, false);
  }
};

const updateOnlineState = () => {
  isOnline.value = navigator.onLine;
};

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  loadServices();
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});
</script>

<style lang="less" scoped>
.service-admin {
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

.page-alert {
  margin: 0;
}

.filters {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) minmax(160px, 1fr) minmax(160px, 1fr) auto;
  gap: 16px;
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
  gap: 12px;
  align-items: center;
  min-height: 32px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
}

.state-panel {
  display: grid;
  min-height: 240px;
  place-items: center;
}

.service-name {
  display: grid;
  gap: 4px;

  code {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}

.order-actions {
  display: flex;
  align-items: center;

  > span {
    margin-right: 4px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.desktop-list small {
  display: block;
  margin-top: 2px;
  color: var(--td-text-color-placeholder);
}

.mobile-list {
  display: none;
  padding: 0;
  margin: 0;
  list-style: none;
}

.service-card {
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
    gap: 14px;
  }

  header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 17px;
  }

  code {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }

  p {
    margin: 0;
    color: var(--td-text-color-secondary);
    line-height: 1.6;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 4px;
  }

  dt {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }

  dd {
    margin: 0;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media (width <= 900px) {
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

  .filter-actions {
    justify-content: space-between;
  }

  .desktop-list {
    display: none;
  }

  .mobile-list {
    display: block;
  }
}
</style>
