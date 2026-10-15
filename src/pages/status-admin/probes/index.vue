<template>
  <main class="probe-admin" aria-labelledby="probe-admin-title">
    <header class="page-header">
      <div>
        <h1 id="probe-admin-title">监控点位</h1>
        <p>为服务配置实际探测的点位，结果写入心跳并聚合到服务状态。</p>
      </div>
      <t-space>
        <t-button variant="outline" :disabled="loading" @click="loadData">刷新</t-button>
        <t-button theme="primary" :disabled="writeDisabled" @click="openCreate">新建点位</t-button>
      </t-space>
    </header>

    <t-alert
      v-if="!canWrite"
      class="page-alert"
      theme="info"
      title="只读模式"
      message="当前账号仅可查看点位，创建、编辑和删除操作已禁用。"
    />
    <t-alert
      v-if="!isOnline"
      class="page-alert"
      theme="warning"
      title="当前处于离线状态"
      message="为避免产生未同步的修改，所有写操作已禁用。"
    />

    <t-card :bordered="false">
      <form class="filters" aria-label="点位筛选" @submit.prevent>
        <label class="filter-field">
          <span>所属服务</span>
          <t-select
            v-model="filters.serviceId"
            clearable
            placeholder="全部服务"
            :options="serviceOptions"
            aria-label="按服务筛选"
          />
        </label>
        <label class="filter-field">
          <span>启用</span>
          <t-select
            v-model="filters.enabled"
            clearable
            placeholder="全部"
            :options="enabledOptions"
            aria-label="按启用状态筛选"
          />
        </label>
        <label class="filter-field">
          <span>搜索</span>
          <t-input v-model="filters.search" clearable placeholder="点位名称、目标或地域" aria-label="搜索点位" />
        </label>
        <div class="filter-actions">
          <t-button variant="outline" type="button" @click="resetFilters">清除筛选</t-button>
          <span aria-live="polite">共 {{ filteredProbes.length }} 项</span>
        </div>
      </form>

      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载点位" />
      </div>
      <div v-else-if="loadError" class="state-panel" role="alert">
        <t-alert theme="error" title="点位加载失败" :message="loadError">
          <template #operation>
            <t-button variant="text" @click="loadData">重试</t-button>
          </template>
        </t-alert>
      </div>
      <t-empty v-else-if="filteredProbes.length === 0" description="没有符合条件的点位" />
      <template v-else>
        <div class="desktop-list">
          <t-table
            row-key="id"
            :data="filteredProbes"
            :columns="columns"
            :hover="true"
            table-layout="fixed"
            aria-label="点位列表"
          >
            <template #probe="{ row }">
              <div class="probe-name">
                <strong>{{ row.name }}</strong>
                <code>{{ row.target }}</code>
              </div>
            </template>
            <template #service="{ row }">{{ serviceName(row.serviceId) }}</template>
            <template #type="{ row }">{{ typeLabel(row.type) }}</template>
            <template #interval="{ row }">{{ row.intervalSeconds }} 秒</template>
            <template #last="{ row }">
              <div class="probe-last">
                <t-tag v-if="row.lastStatus" :theme="serviceStatusTheme(row.lastStatus)" variant="light">
                  {{ serviceStatusLabel(row.lastStatus) }}
                </t-tag>
                <t-tag v-else theme="default" variant="light">等待首次探测</t-tag>
                <small v-if="row.lastCheckedAt">{{ formatStatusTime(row.lastCheckedAt) }}</small>
                <small v-if="row.lastStatus">
                  {{ row.lastLatencyMs ?? 0 }} ms
                  <template v-if="row.consecutiveFailures"> · 连续失败 {{ row.consecutiveFailures }} 次</template>
                </small>
              </div>
            </template>
            <template #enabled="{ row }">
              <t-switch
                :value="row.enabled"
                :disabled="writeDisabled || isWorking(row.id)"
                :aria-label="`${row.name}启用`"
                @change="(value: boolean) => toggleEnabled(row, Boolean(value))"
              />
            </template>
            <template #operation="{ row }">
              <t-space>
                <t-button
                  size="small"
                  variant="text"
                  :disabled="writeDisabled || isWorking(row.id)"
                  :aria-label="`编辑点位${row.name}`"
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
                  :aria-label="`删除点位${row.name}`"
                  @click="removeProbe(row)"
                >
                  删除
                </t-button>
              </t-space>
            </template>
          </t-table>
        </div>

        <ul class="mobile-list" aria-label="点位列表">
          <li v-for="probe in filteredProbes" :key="probe.id" class="probe-card">
            <article>
              <header>
                <div>
                  <h2>{{ probe.name }}</h2>
                  <code>{{ probe.target }}</code>
                </div>
                <t-tag v-if="probe.lastStatus" :theme="serviceStatusTheme(probe.lastStatus)" variant="light">
                  {{ serviceStatusLabel(probe.lastStatus) }}
                </t-tag>
                <t-tag v-else theme="default" variant="light">等待首次探测</t-tag>
              </header>
              <dl>
                <div>
                  <dt>所属服务</dt>
                  <dd>{{ serviceName(probe.serviceId) }}</dd>
                </div>
                <div>
                  <dt>探测类型</dt>
                  <dd>{{ typeLabel(probe.type) }}</dd>
                </div>
                <div>
                  <dt>探测间隔</dt>
                  <dd>{{ probe.intervalSeconds }} 秒</dd>
                </div>
                <div>
                  <dt>最近检测</dt>
                  <dd>{{ probe.lastCheckedAt ? formatStatusTime(probe.lastCheckedAt) : '尚未检测' }}</dd>
                </div>
                <div>
                  <dt>启用</dt>
                  <dd>
                    <t-switch
                      :value="probe.enabled"
                      :disabled="writeDisabled || isWorking(probe.id)"
                      :aria-label="`${probe.name}启用`"
                      @change="(value: boolean) => toggleEnabled(probe, Boolean(value))"
                    />
                  </dd>
                </div>
              </dl>
              <footer>
                <t-button
                  size="small"
                  variant="outline"
                  :disabled="writeDisabled || isWorking(probe.id)"
                  :aria-label="`编辑点位${probe.name}`"
                  @click="openEdit(probe)"
                >
                  编辑
                </t-button>
                <t-button
                  size="small"
                  theme="danger"
                  variant="outline"
                  :loading="isWorking(probe.id)"
                  :disabled="writeDisabled"
                  :aria-label="`删除点位${probe.name}`"
                  @click="removeProbe(probe)"
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
      :header="editingProbe ? '编辑点位' : '新建点位'"
      :width="620"
      :footer="false"
      :close-on-overlay-click="!saving"
    >
      <t-form :data="formData" :rules="rules" :label-width="110" @submit="submitProbe">
        <t-form-item label="所属服务" name="serviceId">
          <t-select
            v-model="formData.serviceId"
            :options="serviceOptions"
            :disabled="saving || Boolean(editingProbe)"
            aria-label="选择所属服务"
          />
        </t-form-item>
        <t-form-item label="点位名称" name="name">
          <t-input v-model="formData.name" :maxlength="100" placeholder="例如：北京 HTTP" :disabled="saving" />
        </t-form-item>
        <t-form-item label="探测类型" name="type">
          <t-select
            v-model="formData.type"
            :options="typeOptions"
            :disabled="saving"
            aria-label="选择探测类型"
            @change="onTypeChange"
          />
        </t-form-item>
        <t-form-item label="探测目标" name="target">
          <t-input v-model="formData.target" :maxlength="2000" :placeholder="targetPlaceholder" :disabled="saving" />
        </t-form-item>
        <t-form-item v-for="field in activeFields" :key="field.key" :label="field.label" :name="field.key">
          <div class="config-field">
            <t-select
              v-if="field.kind === 'string' && field.options"
              v-model="textValues[field.key]"
              :options="optionList(field)"
              :disabled="saving"
              :aria-label="field.label"
            />
            <t-input
              v-else-if="field.kind === 'string'"
              v-model="textValues[field.key]"
              :disabled="saving"
              :aria-label="field.label"
            />
            <t-input-number
              v-else-if="field.kind === 'integer'"
              v-model="numberValues[field.key]"
              :min="field.minimum"
              :max="field.maximum"
              :step="1"
              :disabled="saving"
              :aria-label="field.label"
            />
            <t-switch
              v-else-if="field.kind === 'boolean'"
              v-model="boolValues[field.key]"
              :disabled="saving"
              :aria-label="field.label"
            />
            <t-tag-input v-else v-model="listValues[field.key]" :disabled="saving" :aria-label="field.label" />
            <small v-if="field.description">{{ field.description }}</small>
          </div>
        </t-form-item>
        <t-form-item label="探测间隔" name="intervalSeconds">
          <div class="config-field">
            <t-input-number
              v-model="formData.intervalSeconds"
              :min="10"
              :max="86400"
              :step="5"
              :disabled="saving"
              aria-label="探测间隔秒数"
            />
            <small>秒，最短 10 秒</small>
          </div>
        </t-form-item>
        <t-form-item label="地域标识" name="region">
          <t-input v-model="formData.region" :maxlength="50" placeholder="可选，例如：北京" :disabled="saving" />
        </t-form-item>
        <t-form-item label="启用" name="enabled">
          <t-switch v-model="formData.enabled" :disabled="saving" aria-label="设置点位是否启用" />
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
  name: 'StatusProbes',
};
</script>
<script setup lang="ts">
import type { SubmitContext } from 'tdesign-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import type { AdminProbe, AdminProbeField, AdminProbeInput, AdminProbeType, AdminService } from '@/api/admin-status';
import { adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_THEME } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { ServiceStatus } from '@/types/status';
import { formatStatusTime } from '@/utils/status-date';

type TagValue = string | number;

const userStore = useUserStore();
const services = ref<AdminService[]>([]);
const probes = ref<AdminProbe[]>([]);
const probeTypes = ref<AdminProbeType[]>([]);
const loading = ref(true);
const loadError = ref('');
const workingIds = ref<string[]>([]);
const isOnline = ref(navigator.onLine);
const dialogVisible = ref(false);
const editingProbe = ref<AdminProbe | null>(null);
const saving = ref(false);

const filters = reactive({
  serviceId: '',
  enabled: '' as '' | 'true' | 'false',
  search: '',
});

const formData = reactive<AdminProbeInput>({
  serviceId: '',
  name: '',
  type: '',
  target: '',
  config: {},
  intervalSeconds: 60,
  region: '',
  enabled: true,
});

const textValues = reactive<Record<string, string>>({});
const numberValues = reactive<Record<string, number>>({});
const boolValues = reactive<Record<string, boolean>>({});
const listValues = reactive<Record<string, TagValue[]>>({});

const serviceOptions = computed(() => services.value.map((service) => ({ label: service.name, value: service.id })));
const typeOptions = computed(() => probeTypes.value.map((type) => ({ label: type.label, value: type.name })));
const activeType = computed(() => probeTypes.value.find((type) => type.name === formData.type));
const activeFields = computed(() => activeType.value?.fields ?? []);
const targetPlaceholder = computed(() =>
  formData.type === 'tcp' ? '例如：db.internal:5432' : '例如：https://api.example.com/health',
);

const enabledOptions = [
  { label: '已启用', value: 'true' },
  { label: '已停用', value: 'false' },
];

const columns = [
  { colKey: 'probe', title: '点位', width: 240 },
  { colKey: 'service', title: '所属服务', width: 120 },
  { colKey: 'type', title: '类型', width: 110 },
  { colKey: 'interval', title: '间隔', width: 90 },
  { colKey: 'last', title: '最近结果', width: 180 },
  { colKey: 'enabled', title: '启用', width: 80 },
  { colKey: 'operation', title: '操作', width: 130 },
];

const rules = {
  serviceId: [{ required: true, message: '请选择所属服务', type: 'error' as const }],
  name: [{ required: true, message: '请输入点位名称', type: 'error' as const }],
  type: [{ required: true, message: '请选择探测类型', type: 'error' as const }],
  target: [{ required: true, message: '请输入探测目标', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('service:write'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const orderedProbes = computed(() => [...probes.value].sort((left, right) => left.position - right.position));
const filteredProbes = computed(() => {
  const keyword = filters.search.trim().toLocaleLowerCase('zh-CN');
  return orderedProbes.value.filter((probe) => {
    const matchesKeyword =
      !keyword ||
      [probe.name, probe.target, probe.region || ''].some((value) =>
        value.toLocaleLowerCase('zh-CN').includes(keyword),
      );
    const matchesService = !filters.serviceId || probe.serviceId === filters.serviceId;
    const matchesEnabled = !filters.enabled || probe.enabled === (filters.enabled === 'true');
    return matchesKeyword && matchesService && matchesEnabled;
  });
});

const serviceStatusLabel = (status: ServiceStatus) => SERVICE_STATUS_LABEL[status];
const serviceStatusTheme = (status: ServiceStatus) => SERVICE_STATUS_THEME[status];
const serviceName = (serviceId: string) =>
  services.value.find((service) => service.id === serviceId)?.name || serviceId;
const typeLabel = (type: string) => probeTypes.value.find((item) => item.name === type)?.label || type;
const optionList = (field: AdminProbeField) => (field.options ?? []).map((value) => ({ label: value, value }));

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const handleMutationError = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突或名称重复：该点位已被改动，列表已刷新。');
    await loadData();
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const setWorking = (id: string, value: boolean) => {
  workingIds.value = value ? [...new Set([...workingIds.value, id])] : workingIds.value.filter((item) => item !== id);
};

const isWorking = (id: string) => workingIds.value.includes(id);

const loadData = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const [serviceResult, probeResult, typeResult] = await Promise.all([
      adminStatusApi.services.list(),
      adminStatusApi.probes.list(),
      adminStatusApi.probes.types(),
    ]);
    services.value = serviceResult.items;
    probes.value = probeResult.items;
    probeTypes.value = typeResult.items;
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  filters.serviceId = '';
  filters.enabled = '';
  filters.search = '';
};

/** 表单参数按类型声明的字段重建：类型换了，旧参数就不再适用。 */
const resetConfigValues = (type: AdminProbeType | undefined, existing?: Record<string, unknown>) => {
  Object.keys(textValues).forEach((key) => delete textValues[key]);
  Object.keys(numberValues).forEach((key) => delete numberValues[key]);
  Object.keys(boolValues).forEach((key) => delete boolValues[key]);
  Object.keys(listValues).forEach((key) => delete listValues[key]);
  if (!type) return;
  for (const field of type.fields) {
    const raw = existing?.[field.key] ?? field.default;
    if (field.kind === 'string') {
      textValues[field.key] = typeof raw === 'string' ? raw : '';
    } else if (field.kind === 'integer') {
      numberValues[field.key] = typeof raw === 'number' ? raw : 0;
    } else if (field.kind === 'boolean') {
      boolValues[field.key] = typeof raw === 'boolean' ? raw : false;
    } else {
      listValues[field.key] = Array.isArray(raw)
        ? raw.filter((item): item is TagValue => typeof item === 'string' || typeof item === 'number')
        : [];
    }
  }
};

const collectConfig = (): Record<string, unknown> => {
  const config: Record<string, unknown> = {};
  for (const field of activeFields.value) {
    if (field.kind === 'string') config[field.key] = textValues[field.key] ?? '';
    else if (field.kind === 'integer') config[field.key] = numberValues[field.key] ?? 0;
    else if (field.kind === 'boolean') config[field.key] = Boolean(boolValues[field.key]);
    else config[field.key] = (listValues[field.key] ?? []).map(String);
  }
  return config;
};

const onTypeChange = () => {
  resetConfigValues(activeType.value);
};

const openCreate = () => {
  if (writeDisabled.value) return;
  editingProbe.value = null;
  formData.serviceId = filters.serviceId || services.value[0]?.id || '';
  formData.name = '';
  formData.type = probeTypes.value[0]?.name ?? '';
  formData.target = '';
  formData.intervalSeconds = 60;
  formData.region = '';
  formData.enabled = true;
  resetConfigValues(activeType.value);
  dialogVisible.value = true;
};

const openEdit = (probe: AdminProbe) => {
  if (writeDisabled.value) return;
  editingProbe.value = probe;
  formData.serviceId = probe.serviceId;
  formData.name = probe.name;
  formData.type = probe.type;
  formData.target = probe.target;
  formData.intervalSeconds = probe.intervalSeconds;
  formData.region = probe.region || '';
  formData.enabled = probe.enabled;
  resetConfigValues(activeType.value, probe.configJson);
  dialogVisible.value = true;
};

const submitProbe = async (context: SubmitContext) => {
  if (context.validateResult !== true || writeDisabled.value) return;
  saving.value = true;
  try {
    const payload: AdminProbeInput = {
      serviceId: formData.serviceId,
      name: formData.name.trim(),
      type: formData.type,
      target: formData.target.trim(),
      config: collectConfig(),
      intervalSeconds: formData.intervalSeconds,
      ...(formData.region?.trim() ? { region: formData.region.trim() } : {}),
      enabled: formData.enabled,
    };
    const saved = editingProbe.value
      ? await adminStatusApi.probes.update(editingProbe.value.id, editingProbe.value.version, payload)
      : await adminStatusApi.probes.create(payload);
    const existingIndex = probes.value.findIndex((item) => item.id === saved.id);
    if (existingIndex >= 0) probes.value.splice(existingIndex, 1, saved);
    else probes.value.push(saved);
    dialogVisible.value = false;
    MessagePlugin.success(editingProbe.value ? '点位已更新' : '点位已创建');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    saving.value = false;
  }
};

const toggleEnabled = async (probe: AdminProbe, enabled: boolean) => {
  if (writeDisabled.value || enabled === probe.enabled) return;
  setWorking(probe.id, true);
  try {
    const updated = await adminStatusApi.probes.update(probe.id, probe.version, { enabled });
    const index = probes.value.findIndex((item) => item.id === probe.id);
    if (index >= 0) probes.value.splice(index, 1, updated);
    MessagePlugin.success(enabled ? '点位已启用' : '点位已停用');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    setWorking(probe.id, false);
  }
};

const removeProbe = async (probe: AdminProbe) => {
  if (writeDisabled.value) return;
  setWorking(probe.id, true);
  try {
    // 浏览器确认框在危险操作前提供同步、可访问的阻断确认。
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `确定删除点位“${probe.name}”吗？\n\n目标：${probe.target}\n\n删除后不再探测该目标，历史样本与状态记录保留。`,
    );
    if (!confirmed) return;
    await adminStatusApi.probes.remove(probe.id, probe.version);
    probes.value = probes.value.filter((item) => item.id !== probe.id);
    MessagePlugin.success('点位已删除');
  } catch (error) {
    await handleMutationError(error);
  } finally {
    setWorking(probe.id, false);
  }
};

const updateOnlineState = () => {
  isOnline.value = navigator.onLine;
};

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
});
</script>
<style lang="less" scoped>
.probe-admin {
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
  grid-template-columns: repeat(3, minmax(160px, 1fr)) auto;
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

.probe-name {
  display: grid;
  gap: 4px;

  code {
    overflow: hidden;
    color: var(--td-text-color-placeholder);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.probe-last {
  display: grid;
  gap: 4px;
  justify-items: start;

  small {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}

.config-field {
  display: grid;
  gap: 4px;
  width: 100%;

  small {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}

.mobile-list {
  display: none;
  padding: 0;
  margin: 0;
  list-style: none;
}

.probe-card {
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
    overflow-wrap: anywhere;
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
