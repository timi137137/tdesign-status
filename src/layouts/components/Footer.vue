<template>
  <div :class="prefix + '-footer'">{{ footerText }}</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { adminApi } from '@/api/admin';
import { prefix } from '@/config/global';
import { DEFAULT_SITE_CONFIG } from '@/constants/site';
import { useStatusStore } from '@/store';

const statusStore = useStatusStore();
const footerText = computed(
  () => statusStore.siteConfig.text.adminFooterText || DEFAULT_SITE_CONFIG.text.adminFooterText,
);

onMounted(async () => {
  try {
    const result = await adminApi.siteConfig.get();
    const draft = result.draftJson;
    statusStore.siteConfig = {
      ...statusStore.siteConfig,
      text: {
        ...statusStore.siteConfig.text,
        footerText: draft.footerText || statusStore.siteConfig.text.footerText,
        adminFooterText: draft.adminFooterText || statusStore.siteConfig.text.adminFooterText,
        componentSubtitle: draft.componentSubtitle || statusStore.siteConfig.text.componentSubtitle,
        historySubtitle: draft.historySubtitle || statusStore.siteConfig.text.historySubtitle,
      },
    };
  } catch {
    // 未登录或接口失败时保留默认页脚
  }
});
</script>

<style lang="less" scoped>
.@{starter-prefix}-footer {
  color: var(--td-text-color-placeholder);
  line-height: 20px;
  text-align: center;
}
</style>
