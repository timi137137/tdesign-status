<template>
  <main class="maintenance-detail" aria-labelledby="maintenance-detail-title">
    <header class="page-header">
      <div class="heading-group">
        <t-button variant="text" type="button" aria-label="返回维护计划列表" @click="goBack"> 返回维护列表 </t-button>
        <div>
          <h1 id="maintenance-detail-title">{{ maintenance?.title || '维护详情' }}</h1>
          <p v-if="maintenance">{{ MAINTENANCE_STATUS_LABEL[maintenance.status] }}，进度 {{ maintenance.progress }}%</p>
        </div>
      </div>
      <t-space v-if="maintenance" class="header-actions">
        <t-button
          theme="primary"
          :disabled="publishDisabled || busy || isDirty"
          :loading="busyAction === 'publish'"
          :title="isDirty ? '请先保存当前修改' : ''"
          @click="publishMaintenance"
        >
          {{ maintenance.publishState === 'published' ? '重新发布' : '发布维护' }}
        </t-button>
        <t-button
          v-if="maintenance.status !== 'completed'"
          theme="success"
          variant="outline"
          :disabled="writeDisabled || busy"
          @click="prepareComplete"
        >
          完成维护
        </t-button>
        <t-button
          theme="danger"
          variant="outline"
          :disabled="writeDisabled || busy"
          :loading="busyAction === 'delete'"
          @click="removeMaintenance"
        >
          删除维护
        </t-button>
      </t-space>
    </header>

    <t-alert
      v-if="!canWrite"
      theme="info"
      title="只读模式"
      message="当前账号可查看维护详情，但不能修改窗口、追加进展或删除维护。"
    />
    <t-alert
      v-if="!isOnline"
      theme="warning"
      title="当前处于离线状态"
      message="恢复联网前，保存、追加、发布、完成和删除操作均不可用。"
    />
    <t-alert v-if="conflictMessage" theme="error" title="版本冲突（HTTP 409）" :message="conflictMessage" role="alert">
      <template #operation>
        <t-button variant="text" @click="reloadAfterConflict">重新加载服务器版本</t-button>
      </template>
    </t-alert>

    <div v-if="loading" class="state-panel" role="status" aria-live="polite">
      <t-loading text="正在加载维护详情" />
    </div>
    <div v-else-if="loadError" class="state-panel" role="alert">
      <t-alert theme="error" title="维护详情加载失败" :message="loadError">
        <template #operation>
          <t-button variant="text" @click="loadDetail">重试</t-button>
        </template>
      </t-alert>
    </div>

    <template v-else-if="maintenance">
      <section class="summary-card" aria-labelledby="maintenance-summary-title">
        <div class="summary-heading">
          <div>
            <h2 id="maintenance-summary-title">当前状态</h2>
            <div class="summary-tags">
              <t-tag :theme="MAINTENANCE_STATUS_THEME[maintenance.status]" variant="light">
                {{ MAINTENANCE_STATUS_LABEL[maintenance.status] }}
              </t-tag>
              <t-tag :theme="maintenance.publishState === 'published' ? 'success' : 'default'" variant="light">
                {{ maintenance.publishState === 'published' ? '已发布' : '草稿' }}
              </t-tag>
            </div>
          </div>
          <strong>{{ maintenance.progress }}%</strong>
        </div>
        <t-progress :percentage="maintenance.progress" />
        <dl>
          <div>
            <dt>开始时间</dt>
            <dd>{{ formatTime(maintenance.scheduledStart) }}</dd>
          </div>
          <div>
            <dt>结束时间</dt>
            <dd>{{ formatTime(maintenance.scheduledEnd) }}</dd>
          </div>
          <div>
            <dt>受影响服务</dt>
            <dd>{{ serviceNames(maintenance.affectedServiceIds) }}</dd>
          </div>
          <div>
            <dt>当前版本</dt>
            <dd>v{{ maintenance.version }}</dd>
          </div>
        </dl>
      </section>

      <div class="detail-grid">
        <section class="panel" aria-labelledby="maintenance-metadata-title">
          <header class="panel-header">
            <div>
              <h2 id="maintenance-metadata-title">维护信息与窗口</h2>
              <p>结束时间必须严格晚于开始时间。</p>
            </div>
          </header>
          <t-alert
            v-if="serviceLoadError"
            class="inline-alert"
            theme="warning"
            title="服务选项加载失败"
            :message="serviceLoadError"
          />
          <t-alert
            v-if="metadataWindowError"
            class="inline-alert"
            theme="error"
            title="维护窗口无效"
            :message="metadataWindowError"
            role="alert"
          />
          <t-form :data="metadataForm" :rules="metadataRules" :label-width="110" @submit="saveMetadata">
            <t-form-item label="维护标题" name="title">
              <t-input v-model="metadataForm.title" :maxlength="200" :disabled="writeDisabled || busy" />
            </t-form-item>
            <t-form-item label="维护说明" name="description">
              <t-textarea
                v-model="metadataForm.description"
                :maxlength="5000"
                :autosize="{ minRows: 3, maxRows: 8 }"
                :disabled="writeDisabled || busy"
              />
            </t-form-item>
            <t-form-item label="开始时间" name="scheduledStart">
              <t-date-picker
                v-model="metadataForm.scheduledStart"
                enable-time-picker
                value-type="time-stamp"
                :disabled="writeDisabled || busy"
                aria-label="编辑维护开始时间"
              />
            </t-form-item>
            <t-form-item label="结束时间" name="scheduledEnd">
              <t-date-picker
                v-model="metadataForm.scheduledEnd"
                enable-time-picker
                value-type="time-stamp"
                :disabled="writeDisabled || busy"
                aria-label="编辑维护结束时间"
              />
            </t-form-item>
            <t-form-item label="影响服务" name="affectedServiceIds">
              <t-select
                v-model="metadataForm.affectedServiceIds"
                multiple
                filterable
                clearable
                :options="serviceOptions"
                :disabled="writeDisabled || busy"
                placeholder="可选择多个服务"
                aria-label="编辑维护影响服务"
              />
            </t-form-item>
            <t-form-item v-if="canWrite">
              <t-button
                theme="primary"
                type="submit"
                :loading="busyAction === 'metadata'"
                :disabled="writeDisabled || busy || !metadataDirty"
              >
                保存维护信息
              </t-button>
            </t-form-item>
          </t-form>
        </section>

        <section id="maintenance-update-composer" class="panel" aria-labelledby="maintenance-update-title">
          <header class="panel-header">
            <div>
              <h2 id="maintenance-update-title">追加维护进展</h2>
              <p>状态与进度只能向前推进，已完成维护不可回退。</p>
            </div>
          </header>
          <t-alert
            v-if="updateValidationError"
            class="inline-alert"
            theme="error"
            title="进度或状态无效"
            :message="updateValidationError"
            role="alert"
          />
          <t-form :data="updateForm" :rules="updateRules" :label-width="110" @submit="appendUpdate">
            <t-form-item label="下一状态" name="status">
              <t-select
                v-model="updateForm.status"
                :options="transitionOptions"
                :disabled="writeDisabled || busy"
                aria-label="选择维护下一状态"
                @change="normalizeProgress"
              />
            </t-form-item>
            <t-form-item label="完成进度" name="progress">
              <t-input-number
                v-model="updateForm.progress"
                :min="0"
                :max="100"
                :disabled="writeDisabled || busy || updateForm.status !== 'in_progress'"
                suffix="%"
                aria-label="设置维护完成进度"
              />
            </t-form-item>
            <t-form-item label="发生时间" name="occurredAt">
              <t-date-picker
                v-model="updateForm.occurredAt"
                enable-time-picker
                value-type="time-stamp"
                :disabled="writeDisabled || busy"
                aria-label="选择维护进展发生时间"
              />
            </t-form-item>
            <t-form-item label="进展说明" name="body">
              <t-textarea
                id="maintenance-update-body"
                v-model="updateForm.body"
                :maxlength="10000"
                :autosize="{ minRows: 5, maxRows: 12 }"
                placeholder="说明已完成工作、当前风险和后续安排"
                :disabled="writeDisabled || busy"
              />
            </t-form-item>
            <t-form-item v-if="canWrite">
              <t-button
                :theme="updateForm.status === 'completed' ? 'success' : 'primary'"
                type="submit"
                :loading="busyAction === 'update'"
                :disabled="writeDisabled || busy"
              >
                {{ updateForm.status === 'completed' ? '追加并完成维护' : '追加进展' }}
              </t-button>
            </t-form-item>
          </t-form>
        </section>
      </div>

      <section class="panel timeline-panel" aria-labelledby="maintenance-timeline-title">
        <header class="panel-header">
          <div>
            <h2 id="maintenance-timeline-title">维护时间线</h2>
            <p>共 {{ maintenance.updates.length }} 条进展，按时间从新到旧展示。</p>
          </div>
        </header>
        <t-empty v-if="maintenance.updates.length === 0" description="尚无维护进展" />
        <ol v-else class="timeline-list">
          <li v-for="update in timelineUpdates" :key="update.id">
            <article>
              <header>
                <t-tag :theme="maintenanceStatusTheme(update.status)" variant="light">
                  {{ maintenanceStatusLabel(update.status) }}
                </t-tag>
                <time :datetime="new Date(update.at).toISOString()">{{ formatTime(update.at) }}</time>
              </header>
              <p>{{ update.body }}</p>
            </article>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>

<script lang="ts">
export default {
  name: 'StatusMaintenanceDetail',
};
</script>

<script setup lang="ts">
import dayjs from 'dayjs';
import { MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { type AdminMaintenance, type AdminService, adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_THEME } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { MaintenanceStatus } from '@/types/status';

const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  scheduled: ['scheduled', 'in_progress', 'completed'],
  in_progress: ['in_progress', 'completed'],
  completed: ['completed'],
};

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const maintenance = ref<AdminMaintenance | null>(null);
const services = ref<AdminService[]>([]);
const loading = ref(true);
const loadError = ref('');
const serviceLoadError = ref('');
const conflictMessage = ref('');
const metadataWindowError = ref('');
const updateValidationError = ref('');
const isOnline = ref(navigator.onLine);
const busyAction = ref<'' | 'metadata' | 'update' | 'publish' | 'delete'>('');
const metadataBaseline = ref('');
const updateBaseline = ref('');
const allowLeave = ref(false);

const metadataForm = reactive({
  title: '',
  description: '',
  scheduledStart: Date.now(),
  scheduledEnd: Date.now(),
  affectedServiceIds: [] as string[],
});

const updateForm = reactive({
  status: 'scheduled' as MaintenanceStatus,
  progress: 0,
  occurredAt: Date.now(),
  body: '',
});

const metadataRules = {
  title: [{ required: true, message: '请输入维护标题', type: 'error' as const }],
  scheduledStart: [{ required: true, message: '请选择开始时间', type: 'error' as const }],
  scheduledEnd: [{ required: true, message: '请选择结束时间', type: 'error' as const }],
};

const updateRules = {
  status: [{ required: true, message: '请选择下一状态', type: 'error' as const }],
  progress: [{ required: true, message: '请输入完成进度', type: 'error' as const }],
  occurredAt: [{ required: true, message: '请选择发生时间', type: 'error' as const }],
  body: [{ required: true, message: '请输入进展说明', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('maintenance:write'));
const canPublish = computed(() => canWrite.value && userStore.permissions.includes('publish'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const publishDisabled = computed(() => !canPublish.value || !isOnline.value);
const busy = computed(() => Boolean(busyAction.value));
const serviceOptions = computed(() => services.value.map((service) => ({ label: service.name, value: service.id })));
const serviceNameMap = computed(() => new Map(services.value.map((service) => [service.id, service.name])));
const transitionOptions = computed(() => {
  const current = maintenance.value?.status ?? 'scheduled';
  return MAINTENANCE_TRANSITIONS[current].map((value) => ({
    label: MAINTENANCE_STATUS_LABEL[value],
    value,
  }));
});
const timelineUpdates = computed(() =>
  [...(maintenance.value?.updates ?? [])].sort((left, right) => right.at - left.at),
);

const metadataSnapshot = () =>
  JSON.stringify({
    title: metadataForm.title.trim(),
    description: metadataForm.description.trim(),
    scheduledStart: Number(metadataForm.scheduledStart),
    scheduledEnd: Number(metadataForm.scheduledEnd),
    affectedServiceIds: [...metadataForm.affectedServiceIds].sort(),
  });

const updateSnapshot = () =>
  JSON.stringify({
    status: updateForm.status,
    progress: Number(updateForm.progress),
    occurredAt: Number(updateForm.occurredAt),
    body: updateForm.body,
  });

const metadataDirty = computed(() => Boolean(maintenance.value) && metadataSnapshot() !== metadataBaseline.value);
const updateDirty = computed(() => Boolean(maintenance.value) && updateSnapshot() !== updateBaseline.value);
const isDirty = computed(() => metadataDirty.value || updateDirty.value);

const formatTime = (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm');
const maintenanceStatusLabel = (status: string) => MAINTENANCE_STATUS_LABEL[status as MaintenanceStatus];
const maintenanceStatusTheme = (status: string) => MAINTENANCE_STATUS_THEME[status as MaintenanceStatus];
const serviceNames = (ids: string[]) => ids.map((id) => serviceNameMap.value.get(id) || id).join('、') || '未指定';
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const syncForms = (value: AdminMaintenance) => {
  metadataForm.title = value.title;
  metadataForm.description = value.description || '';
  metadataForm.scheduledStart = value.scheduledStart;
  metadataForm.scheduledEnd = value.scheduledEnd;
  metadataForm.affectedServiceIds = [...value.affectedServiceIds];
  updateForm.status = value.status;
  updateForm.progress = value.progress;
  updateForm.occurredAt = Date.now();
  updateForm.body = '';
  metadataBaseline.value = metadataSnapshot();
  updateBaseline.value = updateSnapshot();
  metadataWindowError.value = '';
  updateValidationError.value = '';
};

const loadServices = async () => {
  serviceLoadError.value = '';
  try {
    const result = await adminStatusApi.services.list();
    services.value = result.items;
  } catch (error) {
    serviceLoadError.value = errorMessage(error);
  }
};

const loadDetail = async () => {
  loading.value = true;
  loadError.value = '';
  conflictMessage.value = '';
  try {
    const value = await adminStatusApi.maintenances.get(String(route.params.id));
    maintenance.value = value;
    syncForms(value);
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const showMutationError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    conflictMessage.value =
      '服务器上的维护版本已变化。为避免覆盖他人修改，当前写入已取消；请重新加载服务器版本后再编辑。';
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const applyUpdatedMaintenance = (value: AdminMaintenance, resetMetadata = true) => {
  maintenance.value = value;
  if (resetMetadata) {
    metadataForm.title = value.title;
    metadataForm.description = value.description || '';
    metadataForm.scheduledStart = value.scheduledStart;
    metadataForm.scheduledEnd = value.scheduledEnd;
    metadataForm.affectedServiceIds = [...value.affectedServiceIds];
    metadataBaseline.value = metadataSnapshot();
  }
  updateForm.status = value.status;
  updateForm.progress = value.progress;
  updateForm.occurredAt = Date.now();
  updateForm.body = '';
  updateBaseline.value = updateSnapshot();
  metadataWindowError.value = '';
  updateValidationError.value = '';
  conflictMessage.value = '';
};

const saveMetadata = async (context: SubmitContext) => {
  if (context.validateResult !== true || !maintenance.value || writeDisabled.value || !metadataDirty.value) {
    return;
  }
  const start = Number(metadataForm.scheduledStart);
  const end = Number(metadataForm.scheduledEnd);
  if (end <= start) {
    metadataWindowError.value = '结束时间必须严格晚于开始时间。';
    return;
  }
  metadataWindowError.value = '';
  busyAction.value = 'metadata';
  try {
    const updated = await adminStatusApi.maintenances.update(maintenance.value.id, maintenance.value.version, {
      title: metadataForm.title.trim(),
      description: metadataForm.description.trim(),
      scheduledStart: start,
      scheduledEnd: end,
      affectedServiceIds: [...metadataForm.affectedServiceIds],
    });
    applyUpdatedMaintenance(updated);
    MessagePlugin.success('维护信息已保存');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const normalizeProgress = () => {
  if (!maintenance.value) return;
  updateValidationError.value = '';
  if (updateForm.status === 'completed') {
    updateForm.progress = 100;
  } else if (updateForm.status === 'scheduled') {
    updateForm.progress = 0;
  } else {
    updateForm.progress = Math.max(1, Math.min(99, maintenance.value.progress));
  }
};

const validateProgress = () => {
  if (!maintenance.value) return '维护数据尚未加载。';
  const progress = Number(updateForm.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return '进度必须是 0 至 100 的整数。';
  }
  if (progress < maintenance.value.progress) {
    return `进度不能低于当前的 ${maintenance.value.progress}%。`;
  }
  if (updateForm.status === 'scheduled' && progress !== 0) {
    return '已排期状态的进度必须为 0%。';
  }
  if (updateForm.status === 'in_progress' && (progress < 1 || progress > 99)) {
    return '进行中状态的进度必须介于 1% 至 99%。';
  }
  if (updateForm.status === 'completed' && progress !== 100) {
    return '已完成状态的进度必须为 100%。';
  }
  return '';
};

const appendUpdate = async (context: SubmitContext) => {
  if (context.validateResult !== true || !maintenance.value || writeDisabled.value) return;
  if (!MAINTENANCE_TRANSITIONS[maintenance.value.status].includes(updateForm.status)) {
    updateValidationError.value = '所选状态转换不合法，请重新选择。';
    return;
  }
  updateValidationError.value = validateProgress();
  if (updateValidationError.value) return;
  busyAction.value = 'update';
  try {
    const updated = await adminStatusApi.maintenances.appendUpdate(maintenance.value.id, maintenance.value.version, {
      status: updateForm.status,
      progress: Number(updateForm.progress),
      occurredAt: Number(updateForm.occurredAt),
      body: updateForm.body.trim(),
    });
    applyUpdatedMaintenance(updated);
    MessagePlugin.success(updated.status === 'completed' ? '维护已完成，进展已追加' : '维护进展已追加');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const publishMaintenance = async () => {
  if (!maintenance.value || publishDisabled.value || isDirty.value) return;
  busyAction.value = 'publish';
  try {
    const updated = await adminStatusApi.maintenances.publish(maintenance.value.id, maintenance.value.version);
    applyUpdatedMaintenance(updated);
    MessagePlugin.success('维护计划已发布到公开状态页');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const prepareComplete = async () => {
  if (!maintenance.value || writeDisabled.value) return;
  updateForm.status = 'completed';
  updateForm.progress = 100;
  updateForm.occurredAt = Date.now();
  await nextTick();
  document.getElementById('maintenance-update-composer')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  document.getElementById('maintenance-update-body')?.focus();
};

const removeMaintenance = async () => {
  if (!maintenance.value || writeDisabled.value) return;
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(
    `确定软删除维护“${maintenance.value.title}”吗？\n\n当前进度 ${maintenance.value.progress}%，包含 ${maintenance.value.updates.length} 条时间线进展；删除后将从公开状态页移除。`,
  );
  if (!confirmed) return;
  busyAction.value = 'delete';
  try {
    await adminStatusApi.maintenances.remove(maintenance.value.id, maintenance.value.version);
    allowLeave.value = true;
    MessagePlugin.success('维护计划已删除');
    await router.replace('/status/maintenances');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const reloadAfterConflict = () => {
  loadDetail();
};

const goBack = () => {
  router.push('/status/maintenances');
};

const updateOnlineState = () => {
  isOnline.value = navigator.onLine;
};

const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!isDirty.value || allowLeave.value) return;
  event.preventDefault();
  event.returnValue = '';
};

onBeforeRouteLeave(() => {
  if (allowLeave.value || !isDirty.value) return true;
  // eslint-disable-next-line no-alert
  return window.confirm('当前页面有未保存的维护修改，确定离开吗？');
});

onMounted(() => {
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  window.addEventListener('beforeunload', beforeUnload);
  Promise.all([loadServices(), loadDetail()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style lang="less" scoped>
.maintenance-detail {
  display: grid;
  gap: 16px;
}

.page-header {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
}

.heading-group {
  display: flex;
  gap: 12px;
  align-items: flex-start;

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

.header-actions {
  flex: none;
}

.state-panel {
  display: grid;
  min-height: 320px;
  place-items: center;
}

.summary-card,
.panel {
  padding: 20px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.summary-card {
  display: grid;
  gap: 16px;

  h2 {
    margin: 0 0 10px;
    font-size: 18px;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 5px;
  }

  dt {
    color: var(--td-text-color-placeholder);
    font-size: 13px;
  }

  dd {
    margin: 0;
    color: var(--td-text-color-primary);
    word-break: break-word;
  }
}

.summary-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;

  > strong {
    color: var(--td-brand-color);
    font-size: 28px;
  }
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.panel-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;

  h2 {
    margin: 0;
    font-size: 18px;
  }

  p {
    margin: 5px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.inline-alert {
  margin-bottom: 16px;
}

.timeline-list {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    position: relative;
    padding: 0 0 24px 24px;
    border-left: 2px solid var(--td-component-stroke);
  }

  li::before {
    position: absolute;
    top: 4px;
    left: -6px;
    width: 10px;
    height: 10px;
    content: '';
    background: var(--td-brand-color);
    border: 2px solid var(--td-bg-color-container);
    border-radius: 50%;
  }

  li:last-child {
    padding-bottom: 0;
    border-left-color: transparent;
  }

  article {
    display: grid;
    gap: 10px;
  }

  header {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  time {
    color: var(--td-text-color-placeholder);
    font-size: 13px;
  }

  p {
    margin: 0;
    color: var(--td-text-color-secondary);
    line-height: 1.7;
    white-space: pre-wrap;
  }
}

@media (width <= 960px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-card dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 600px) {
  .heading-group {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
  }

  .summary-card dl {
    grid-template-columns: 1fr;
  }

  .summary-card,
  .panel {
    padding: 16px;
  }

  .timeline-list header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
