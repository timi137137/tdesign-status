<template>
  <t-dialog
    v-model:visible="visible"
    header="发现浏览器旧状态数据"
    :footer="false"
    :close-on-overlay-click="false"
    width="560px"
  >
    <p class="legacy-import__lead">
      检测到本地 persist（{{ preview?.key }}）。服务端快照才是公开页真相，不会自动覆盖当前数据库。
    </p>
    <ul v-if="preview" class="legacy-import__counts">
      <li>组件 {{ preview.serviceCount }} 个</li>
      <li>事件 {{ preview.incidentCount }} 条</li>
      <li>维护 {{ preview.maintenanceCount }} 条</li>
    </ul>
    <p class="legacy-import__hint">
      事件与维护不会导入，避免覆盖已发布内容。仅可把「服务端尚不存在」的组件补进草稿库。
    </p>
    <t-space>
      <t-button theme="primary" :disabled="!canImport" :loading="importing" @click="importMissingServices">
        导入缺失组件
      </t-button>
      <t-button variant="outline" :disabled="importing" @click="discard">丢弃本地副本</t-button>
    </t-space>
    <p v-if="message" class="legacy-import__message" role="status">{{ message }}</p>
  </t-dialog>
</template>

<script lang="ts">
export default {
  name: 'LegacyStatusImport',
};
</script>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, onMounted, ref } from 'vue';

import { adminStatusApi } from '@/api/admin-status';
import { discardLegacyStatus, type LegacyStatusPreview, readLegacyStatusPreview } from '@/utils/legacy-status';

const preview = ref<LegacyStatusPreview | null>(null);
const importing = ref(false);
const message = ref('');
const visible = computed({
  get: () => Boolean(preview.value),
  set: (value) => {
    if (!value) preview.value = null;
  },
});
const canImport = computed(() => Boolean(preview.value?.services.length));

onMounted(() => {
  preview.value = readLegacyStatusPreview();
});

const discard = () => {
  discardLegacyStatus();
  preview.value = null;
  MessagePlugin.success('已丢弃浏览器旧状态数据');
};

const importMissingServices = async () => {
  if (!preview.value || importing.value) return;
  importing.value = true;
  message.value = '';
  try {
    const existing = await adminStatusApi.services.list({ pageSize: 100 });
    const known = new Set(existing.items.flatMap((item) => [item.id, item.slug].filter(Boolean) as string[]));
    const missing = preview.value.services.filter((item) => !known.has(item.id));
    let created = 0;
    for (const service of missing) {
      await adminStatusApi.services.create({
        slug: service.id,
        name: service.name,
        description: service.description,
        status: service.status,
        enabled: service.enabled,
      });
      created += 1;
    }
    discardLegacyStatus([preview.value.key]);
    preview.value = null;
    MessagePlugin.success(
      created > 0 ? `已导入 ${created} 个缺失组件，未改写现有服务` : '没有缺失组件可导入，已清除本地副本',
    );
  } catch (error) {
    message.value = error instanceof Error ? error.message : '导入失败';
  } finally {
    importing.value = false;
  }
};
</script>

<style lang="less" scoped>
.legacy-import__lead,
.legacy-import__hint,
.legacy-import__message {
  margin: 0 0 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}

.legacy-import__counts {
  margin: 0 0 12px;
  padding-left: 18px;
}
</style>
