<template>
  <main class="incident-detail" aria-labelledby="incident-detail-title">
    <header class="page-header">
      <div class="heading-group">
        <t-button variant="text" type="button" aria-label="返回事件列表" @click="goBack"> 返回事件列表 </t-button>
        <div>
          <h1 id="incident-detail-title">{{ incident?.title || '事件详情' }}</h1>
          <p v-if="incident">
            {{ INCIDENT_STATUS_LABEL[incident.status] }}，最后更新于
            {{ formatTime(incident.updatedAt || incident.startedAt) }}
          </p>
        </div>
      </div>
      <t-space v-if="incident" class="header-actions">
        <t-button
          theme="primary"
          :disabled="publishDisabled || busy || isDirty"
          :loading="busyAction === 'publish'"
          :title="isDirty ? '请先保存当前修改' : ''"
          @click="publishIncident"
        >
          {{ incident.publishState === 'published' ? '重新发布' : '发布事件' }}
        </t-button>
        <t-button
          v-if="incident.status !== 'resolved'"
          theme="success"
          variant="outline"
          :disabled="writeDisabled || busy"
          @click="prepareResolve"
        >
          解决事件
        </t-button>
        <t-button
          theme="danger"
          variant="outline"
          :disabled="writeDisabled || busy"
          :loading="busyAction === 'delete'"
          @click="removeIncident"
        >
          删除事件
        </t-button>
      </t-space>
    </header>

    <t-alert
      v-if="!canWrite"
      theme="info"
      title="只读模式"
      message="当前账号可查看事件详情，但不能修改元数据、追加进展或删除事件。"
    />
    <t-alert
      v-if="!isOnline"
      theme="warning"
      title="当前处于离线状态"
      message="恢复联网前，保存、追加、发布、解决和删除操作均不可用。"
    />
    <t-alert v-if="conflictMessage" theme="error" title="版本冲突（HTTP 409）" :message="conflictMessage" role="alert">
      <template #operation>
        <t-button variant="text" @click="reloadAfterConflict">重新加载服务器版本</t-button>
      </template>
    </t-alert>

    <div v-if="loading" class="state-panel" role="status" aria-live="polite">
      <t-loading text="正在加载事件详情" />
    </div>
    <div v-else-if="loadError" class="state-panel" role="alert">
      <t-alert theme="error" title="事件详情加载失败" :message="loadError">
        <template #operation>
          <t-button variant="text" @click="loadDetail">重试</t-button>
        </template>
      </t-alert>
    </div>

    <template v-else-if="incident">
      <section class="summary-card" aria-labelledby="incident-summary-title">
        <h2 id="incident-summary-title">当前状态</h2>
        <div class="summary-tags">
          <t-tag :theme="INCIDENT_IMPACT_THEME[incident.impact]" variant="light">
            {{ INCIDENT_IMPACT_LABEL[incident.impact] }}
          </t-tag>
          <t-tag variant="light">{{ INCIDENT_STATUS_LABEL[incident.status] }}</t-tag>
          <t-tag :theme="incident.publishState === 'published' ? 'success' : 'default'" variant="light">
            {{ incident.publishState === 'published' ? '已发布' : '草稿' }}
          </t-tag>
        </div>
        <dl>
          <div>
            <dt>开始时间</dt>
            <dd>{{ formatTime(incident.startedAt) }}</dd>
          </div>
          <div>
            <dt>解决时间</dt>
            <dd>{{ incident.resolvedAt ? formatTime(incident.resolvedAt) : '尚未解决' }}</dd>
          </div>
          <div>
            <dt>受影响服务</dt>
            <dd>{{ serviceNames(incident.affectedServiceIds) }}</dd>
          </div>
          <div>
            <dt>当前版本</dt>
            <dd>v{{ incident.version }}</dd>
          </div>
        </dl>
      </section>

      <div class="detail-grid">
        <section class="panel" aria-labelledby="incident-metadata-title">
          <header class="panel-header">
            <div>
              <h2 id="incident-metadata-title">事件信息</h2>
              <p>状态只能通过追加时间线进展进行转换。</p>
            </div>
          </header>
          <t-alert
            v-if="serviceLoadError"
            class="inline-alert"
            theme="warning"
            title="服务选项加载失败"
            :message="serviceLoadError"
          />
          <t-form :data="metadataForm" :rules="metadataRules" :label-width="110" @submit="saveMetadata">
            <t-form-item label="事件标题" name="title">
              <t-input v-model="metadataForm.title" :maxlength="200" :disabled="writeDisabled || busy" />
            </t-form-item>
            <t-form-item label="影响级别" name="impact">
              <t-select
                v-model="metadataForm.impact"
                :options="impactOptions"
                :disabled="writeDisabled || busy"
                aria-label="编辑事件影响级别"
              />
            </t-form-item>
            <t-form-item label="开始时间" name="startedAt">
              <t-date-picker
                v-model="metadataForm.startedAt"
                enable-time-picker
                value-type="time-stamp"
                :disabled="writeDisabled || busy"
                aria-label="编辑事件开始时间"
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
                aria-label="编辑受影响服务"
              />
            </t-form-item>
            <t-form-item v-if="canWrite">
              <t-button
                theme="primary"
                type="submit"
                :loading="busyAction === 'metadata'"
                :disabled="writeDisabled || busy || !metadataDirty"
              >
                保存事件信息
              </t-button>
            </t-form-item>
          </t-form>
        </section>

        <section id="incident-update-composer" class="panel" aria-labelledby="incident-update-title">
          <header class="panel-header">
            <div>
              <h2 id="incident-update-title">追加事件进展</h2>
              <p>仅提供从当前状态出发的合法转换；已解决事件不可回退。</p>
            </div>
          </header>
          <t-form :data="updateForm" :rules="updateRules" :label-width="110" @submit="appendUpdate">
            <t-form-item label="下一状态" name="status">
              <t-select
                v-model="updateForm.status"
                :options="transitionOptions"
                :disabled="writeDisabled || busy"
                aria-label="选择事件下一状态"
              />
            </t-form-item>
            <t-form-item label="发生时间" name="occurredAt">
              <t-date-picker
                v-model="updateForm.occurredAt"
                enable-time-picker
                value-type="time-stamp"
                :disabled="writeDisabled || busy"
                aria-label="选择进展发生时间"
              />
            </t-form-item>
            <t-form-item label="进展说明" name="body">
              <t-textarea
                id="incident-update-body"
                v-model="updateForm.body"
                :maxlength="10000"
                :autosize="{ minRows: 5, maxRows: 12 }"
                placeholder="说明最新发现、处置动作及用户影响"
                :disabled="writeDisabled || busy"
              />
            </t-form-item>
            <t-form-item v-if="canWrite">
              <t-button
                :theme="updateForm.status === 'resolved' ? 'success' : 'primary'"
                type="submit"
                :loading="busyAction === 'update'"
                :disabled="writeDisabled || busy"
              >
                {{ updateForm.status === 'resolved' ? '追加并解决事件' : '追加进展' }}
              </t-button>
            </t-form-item>
          </t-form>
        </section>
      </div>

      <section class="panel timeline-panel" aria-labelledby="incident-timeline-title">
        <header class="panel-header">
          <div>
            <h2 id="incident-timeline-title">事件时间线</h2>
            <p>共 {{ incident.updates.length }} 条进展，按时间从新到旧展示。</p>
          </div>
        </header>
        <t-empty v-if="incident.updates.length === 0" description="尚无事件进展" />
        <ol v-else class="timeline-list">
          <li v-for="update in timelineUpdates" :key="update.id">
            <article>
              <header>
                <t-tag variant="light">{{ incidentStatusLabel(update.status) }}</t-tag>
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
  name: 'StatusIncidentDetail',
};
</script>

<script setup lang="ts">
import dayjs from 'dayjs';
import { MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { type AdminIncident, type AdminService, adminStatusApi } from '@/api/admin-status';
import { ApiError } from '@/api/http';
import { INCIDENT_IMPACT_LABEL, INCIDENT_IMPACT_THEME, INCIDENT_STATUS_LABEL } from '@/constants/status';
import { useUserStore } from '@/store/modules/user';
import type { IncidentImpact, IncidentStatus } from '@/types/status';

const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ['investigating', 'identified', 'monitoring', 'resolved'],
  identified: ['identified', 'monitoring', 'resolved'],
  monitoring: ['monitoring', 'investigating', 'resolved'],
  resolved: ['resolved'],
};

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const incident = ref<AdminIncident | null>(null);
const services = ref<AdminService[]>([]);
const loading = ref(true);
const loadError = ref('');
const serviceLoadError = ref('');
const conflictMessage = ref('');
const isOnline = ref(navigator.onLine);
const busyAction = ref<'' | 'metadata' | 'update' | 'publish' | 'delete'>('');
const metadataBaseline = ref('');
const updateBaseline = ref('');
const allowLeave = ref(false);

const metadataForm = reactive({
  title: '',
  impact: 'minor' as IncidentImpact,
  startedAt: Date.now(),
  affectedServiceIds: [] as string[],
});

const updateForm = reactive({
  status: 'investigating' as IncidentStatus,
  occurredAt: Date.now(),
  body: '',
});

const impactOptions = (Object.keys(INCIDENT_IMPACT_LABEL) as IncidentImpact[]).map((value) => ({
  label: INCIDENT_IMPACT_LABEL[value],
  value,
}));

const metadataRules = {
  title: [{ required: true, message: '请输入事件标题', type: 'error' as const }],
  impact: [{ required: true, message: '请选择影响级别', type: 'error' as const }],
  startedAt: [{ required: true, message: '请选择开始时间', type: 'error' as const }],
};

const updateRules = {
  status: [{ required: true, message: '请选择下一状态', type: 'error' as const }],
  occurredAt: [{ required: true, message: '请选择发生时间', type: 'error' as const }],
  body: [{ required: true, message: '请输入进展说明', type: 'error' as const }],
};

const canWrite = computed(() => userStore.permissions.includes('incident:write'));
const canPublish = computed(() => canWrite.value && userStore.permissions.includes('publish'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const publishDisabled = computed(() => !canPublish.value || !isOnline.value);
const busy = computed(() => Boolean(busyAction.value));
const serviceOptions = computed(() => services.value.map((service) => ({ label: service.name, value: service.id })));
const serviceNameMap = computed(() => new Map(services.value.map((service) => [service.id, service.name])));
const transitionOptions = computed(() => {
  const current = incident.value?.status ?? 'investigating';
  return INCIDENT_TRANSITIONS[current].map((value) => ({
    label: INCIDENT_STATUS_LABEL[value],
    value,
  }));
});
const timelineUpdates = computed(() => [...(incident.value?.updates ?? [])].sort((left, right) => right.at - left.at));

const metadataSnapshot = () =>
  JSON.stringify({
    title: metadataForm.title.trim(),
    impact: metadataForm.impact,
    startedAt: Number(metadataForm.startedAt),
    affectedServiceIds: [...metadataForm.affectedServiceIds].sort(),
  });

const updateSnapshot = () =>
  JSON.stringify({
    status: updateForm.status,
    occurredAt: Number(updateForm.occurredAt),
    body: updateForm.body,
  });

const metadataDirty = computed(() => Boolean(incident.value) && metadataSnapshot() !== metadataBaseline.value);
const updateDirty = computed(() => Boolean(incident.value) && updateSnapshot() !== updateBaseline.value);
const isDirty = computed(() => metadataDirty.value || updateDirty.value);

const formatTime = (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm');
const incidentStatusLabel = (status: string) => INCIDENT_STATUS_LABEL[status as IncidentStatus];
const serviceNames = (ids: string[]) => ids.map((id) => serviceNameMap.value.get(id) || id).join('、') || '未指定';
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const syncForms = (value: AdminIncident) => {
  metadataForm.title = value.title;
  metadataForm.impact = value.impact;
  metadataForm.startedAt = value.startedAt;
  metadataForm.affectedServiceIds = [...value.affectedServiceIds];
  updateForm.status = value.status;
  updateForm.occurredAt = Date.now();
  updateForm.body = '';
  metadataBaseline.value = metadataSnapshot();
  updateBaseline.value = updateSnapshot();
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
    const value = await adminStatusApi.incidents.get(String(route.params.id));
    incident.value = value;
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
      '服务器上的事件版本已变化。为避免覆盖他人修改，当前写入已取消；请重新加载服务器版本后再编辑。';
    return;
  }
  MessagePlugin.error(errorMessage(error));
};

const applyUpdatedIncident = (value: AdminIncident, resetMetadata = true) => {
  incident.value = value;
  if (resetMetadata) {
    metadataForm.title = value.title;
    metadataForm.impact = value.impact;
    metadataForm.startedAt = value.startedAt;
    metadataForm.affectedServiceIds = [...value.affectedServiceIds];
    metadataBaseline.value = metadataSnapshot();
  }
  updateForm.status = value.status;
  updateForm.occurredAt = Date.now();
  updateForm.body = '';
  updateBaseline.value = updateSnapshot();
  conflictMessage.value = '';
};

const saveMetadata = async (context: SubmitContext) => {
  if (context.validateResult !== true || !incident.value || writeDisabled.value || !metadataDirty.value) {
    return;
  }
  busyAction.value = 'metadata';
  try {
    const updated = await adminStatusApi.incidents.update(incident.value.id, incident.value.version, {
      title: metadataForm.title.trim(),
      impact: metadataForm.impact,
      startedAt: Number(metadataForm.startedAt),
      affectedServiceIds: [...metadataForm.affectedServiceIds],
    });
    applyUpdatedIncident(updated);
    MessagePlugin.success('事件信息已保存');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const appendUpdate = async (context: SubmitContext) => {
  if (context.validateResult !== true || !incident.value || writeDisabled.value) return;
  if (!INCIDENT_TRANSITIONS[incident.value.status].includes(updateForm.status)) {
    MessagePlugin.error('所选状态转换不合法，请重新选择。');
    return;
  }
  busyAction.value = 'update';
  try {
    const updated = await adminStatusApi.incidents.appendUpdate(incident.value.id, incident.value.version, {
      status: updateForm.status,
      occurredAt: Number(updateForm.occurredAt),
      body: updateForm.body.trim(),
    });
    applyUpdatedIncident(updated);
    MessagePlugin.success(updated.status === 'resolved' ? '事件已解决，进展已追加' : '事件进展已追加');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const publishIncident = async () => {
  if (!incident.value || publishDisabled.value || isDirty.value) return;
  busyAction.value = 'publish';
  try {
    const updated = await adminStatusApi.incidents.publish(incident.value.id, incident.value.version);
    applyUpdatedIncident(updated);
    MessagePlugin.success('事件已发布到公开状态页');
  } catch (error) {
    showMutationError(error);
  } finally {
    busyAction.value = '';
  }
};

const prepareResolve = async () => {
  if (!incident.value || writeDisabled.value) return;
  updateForm.status = 'resolved';
  updateForm.occurredAt = Date.now();
  await nextTick();
  document.getElementById('incident-update-composer')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  document.getElementById('incident-update-body')?.focus();
};

const removeIncident = async () => {
  if (!incident.value || writeDisabled.value) return;
  // eslint-disable-next-line no-alert
  const confirmed = window.confirm(
    `确定软删除事件“${incident.value.title}”吗？\n\n该事件包含 ${incident.value.updates.length} 条时间线进展，删除后将从公开状态页移除。`,
  );
  if (!confirmed) return;
  busyAction.value = 'delete';
  try {
    await adminStatusApi.incidents.remove(incident.value.id, incident.value.version);
    allowLeave.value = true;
    MessagePlugin.success('事件已删除');
    await router.replace('/status/incidents');
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
  router.push('/status/incidents');
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
  return window.confirm('当前页面有未保存的事件修改，确定离开吗？');
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
.incident-detail {
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
    margin: 0;
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
