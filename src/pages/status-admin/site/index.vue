<template>
  <main class="site-admin" aria-labelledby="site-admin-title">
    <header class="page-header">
      <div>
        <h1 id="site-admin-title">站点设置</h1>
        <p>维护公开页品牌与文案。先保存草稿，确认后再发布。</p>
      </div>
      <t-space>
        <t-button variant="outline" :disabled="writeDisabled || saving" @click="saveDraft">保存草稿</t-button>
        <t-button
          theme="primary"
          :disabled="writeDisabled || saving || !hasDraft"
          :loading="publishing"
          @click="publish"
        >
          发布
        </t-button>
      </t-space>
    </header>

    <t-alert
      v-if="!canWrite"
      theme="info"
      title="只读模式"
      message="当前账号仅可查看站点设置，保存草稿和发布已禁用。"
    />
    <t-alert
      v-if="unpublished"
      theme="warning"
      title="草稿尚未发布"
      message="当前草稿与已发布内容不一致，公开页仍显示上一版。"
    />

    <t-card :bordered="false">
      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载站点设置" />
      </div>
      <t-alert v-else-if="loadError" theme="error" title="站点设置加载失败" :message="loadError">
        <template #operation>
          <t-button variant="text" @click="loadConfig">重试</t-button>
        </template>
      </t-alert>
      <t-form v-else :data="form" :rules="rules" :label-width="120" :disabled="writeDisabled">
        <t-form-item label="站点名称" name="siteName">
          <t-input v-model="form.siteName" :maxlength="100" placeholder="例如：腾讯服务状态" />
        </t-form-item>
        <t-form-item label="公开页标题" name="title">
          <t-input v-model="form.title" :maxlength="200" placeholder="浏览器标题与顶栏标题" />
        </t-form-item>
        <t-form-item label="站点说明" name="description">
          <t-textarea
            v-model="form.description"
            :maxlength="2000"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="用于公开页简介和搜索摘要"
          />
        </t-form-item>
        <t-form-item label="语言" name="locale">
          <t-input v-model="form.locale" :maxlength="20" placeholder="zh-CN" />
        </t-form-item>
        <t-form-item label="时区" name="timezone">
          <t-input v-model="form.timezone" :maxlength="100" placeholder="Asia/Shanghai" />
        </t-form-item>
        <t-form-item label="Logo 地址" name="logoUrl">
          <t-input v-model="form.logoUrl" :maxlength="2000" placeholder="https:// 开头的绝对地址，可留空" />
        </t-form-item>
        <t-form-item label="支持链接" name="supportUrl">
          <t-input v-model="form.supportUrl" :maxlength="2000" placeholder="https:// 开头的绝对地址，可留空" />
        </t-form-item>
        <t-form-item label="组件状态说明" name="componentSubtitle">
          <t-input v-model="form.componentSubtitle" :maxlength="200" placeholder="公开页组件状态卡片副标题" />
        </t-form-item>
        <t-form-item label="历史说明" name="historySubtitle">
          <t-input v-model="form.historySubtitle" :maxlength="200" placeholder="公开页历史卡片副标题" />
        </t-form-item>
        <t-form-item label="公开页页脚" name="footerText">
          <t-input v-model="form.footerText" :maxlength="200" placeholder="公开页底部文案" />
        </t-form-item>
        <t-form-item label="后台页脚" name="adminFooterText">
          <t-input v-model="form.adminFooterText" :maxlength="200" placeholder="管理端底部版权文案" />
        </t-form-item>
      </t-form>
    </t-card>
  </main>
</template>

<script lang="ts">
export default {
  name: 'StatusSite',
};
</script>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import { adminApi, type AdminSiteConfigValue } from '@/api/admin';
import { ApiError } from '@/api/http';
import { useUserStore } from '@/store';

const emptyConfig = (): AdminSiteConfigValue => ({
  siteName: '',
  title: '',
  description: '',
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  logoUrl: '',
  supportUrl: '',
  componentSubtitle: '通栏为近 24 小时探测；双列半宽为近 30 日状态。',
  historySubtitle: '按开始时间倒序。完整进展请打开详情。',
  footerText: '腾讯服务状态',
  adminFooterText: `Copyright © 2021-${new Date().getFullYear()} Tencent. All Rights Reserved`,
});

const userStore = useUserStore();
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const publishing = ref(false);
const version = ref(1);
const published = ref<AdminSiteConfigValue | null>(null);
const form = reactive(emptyConfig());
const isOnline = ref(navigator.onLine);

const canWrite = computed(() => userStore.permissions.includes('site:write'));
const writeDisabled = computed(() => !canWrite.value || !isOnline.value);
const hasDraft = computed(() =>
  Boolean(form.siteName && form.title && form.description && form.locale && form.timezone),
);
const unpublished = computed(() => JSON.stringify(form) !== JSON.stringify(published.value));

const rules = {
  siteName: [{ required: true, message: '请输入站点名称', type: 'error' as const }],
  title: [{ required: true, message: '请输入公开页标题', type: 'error' as const }],
  description: [{ required: true, message: '请输入站点说明', type: 'error' as const }],
  locale: [{ required: true, message: '请输入语言', type: 'error' as const }],
  timezone: [{ required: true, message: '请输入时区', type: 'error' as const }],
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const applyConfig = (draft: AdminSiteConfigValue) => {
  Object.assign(form, emptyConfig(), draft);
};

const loadConfig = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminApi.siteConfig.get();
    version.value = result.version;
    published.value = result.publishedJson;
    applyConfig(result.draftJson);
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const handleConflict = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突：配置已被其他用户修改，已重新加载。');
    await loadConfig();
    return true;
  }
  return false;
};

const saveDraft = async () => {
  if (writeDisabled.value) return;
  saving.value = true;
  try {
    const saved = await adminApi.siteConfig.saveDraft(version.value, { ...form });
    version.value = saved.version;
    applyConfig(saved.draftJson);
    MessagePlugin.success('草稿已保存');
  } catch (error) {
    if (!(await handleConflict(error))) MessagePlugin.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
};

const publish = async () => {
  if (writeDisabled.value || !hasDraft.value) return;
  publishing.value = true;
  try {
    const saved = await adminApi.siteConfig.publish(version.value);
    version.value = saved.version;
    published.value = saved.publishedJson;
    applyConfig(saved.draftJson);
    MessagePlugin.success('站点配置已发布');
  } catch (error) {
    if (!(await handleConflict(error))) MessagePlugin.error(errorMessage(error));
  } finally {
    publishing.value = false;
  }
};

onMounted(() => {
  window.addEventListener('online', () => {
    isOnline.value = true;
  });
  window.addEventListener('offline', () => {
    isOnline.value = false;
  });
  loadConfig();
});
</script>

<style lang="less" scoped>
.site-admin {
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

@media (width <= 768px) {
  .page-header {
    flex-direction: column;
  }
}
</style>
