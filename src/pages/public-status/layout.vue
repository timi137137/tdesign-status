<template>
  <t-layout class="public-status">
    <t-header class="public-status__header" height="auto">
      <public-header
        v-model="activeMenu"
        :site-title="statusStore.siteConfig.text.headerTitle"
        :nav-current="statusStore.siteConfig.text.navCurrent"
        :nav-history="statusStore.siteConfig.text.navHistory"
        :logo-url="statusStore.siteConfig.logoUrl"
        @change="onMenuChange"
      />
    </t-header>
    <t-content id="main-content" class="public-status__content" tabindex="-1">
      <div class="public-status__inner">
        <div
          v-if="statusStore.offline || statusStore.stale || statusStore.error"
          class="public-status__freshness"
          role="status"
          aria-live="polite"
        >
          <strong>{{ statusStore.offline ? '当前处于离线状态' : '状态数据暂未更新' }}</strong>
          <span v-if="statusStore.fetchedAt"
            >正在展示 {{ formatFetchedAt(statusStore.fetchedAt) }} 的最后已知状态。</span
          >
          <span v-else>首次加载需要连接网络。</span>
        </div>
        <router-view />
      </div>
    </t-content>
    <t-footer class="public-status__footer">{{ statusStore.siteConfig.text.footerText }}</t-footer>
  </t-layout>
</template>

<script lang="ts">
export default {
  name: 'PublicStatusLayout',
};
</script>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useSettingStore, useStatusStore } from '@/store';

import PublicHeader from './components/PublicHeader.vue';

const statusStore = useStatusStore();
const route = useRoute();
const router = useRouter();
const activeMenu = ref('current');
const syncingFromClick = ref(false);

const formatFetchedAt = (value: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: statusStore.siteConfig.timezone,
  }).format(value);

const headerOffset = () => {
  const header = document.querySelector('.public-status__header') as HTMLElement | null;
  return (header?.offsetHeight || 56) + 8;
};

const scrollToId = (id: string) => {
  syncingFromClick.value = true;
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      syncingFromClick.value = false;
    }, 500);
  });
};

const syncMenuByScroll = () => {
  if (syncingFromClick.value) return;
  if (route.path === '/history') {
    activeMenu.value = 'history';
    return;
  }
  const historyEl = document.getElementById('history');
  if (!historyEl) {
    activeMenu.value = 'current';
    return;
  }
  activeMenu.value = historyEl.getBoundingClientRect().top <= headerOffset() ? 'history' : 'current';
};

const onMenuChange = (value: string) => {
  if (value === 'admin') return;
  const targetId = value === 'history' ? 'history' : 'current';
  if (route.path !== '/') {
    router.push({ path: '/' }).then(() => {
      nextTick(() => scrollToId(targetId));
    });
    return;
  }
  scrollToId(targetId);
};

watch(
  () => route.path,
  () => {
    nextTick(syncMenuByScroll);
  },
);

watch(
  () =>
    [statusStore.siteConfig.themeColor, statusStore.siteConfig.faviconUrl, statusStore.siteConfig.siteName] as const,
  ([themeColor, faviconUrl, siteName]) => {
    if (themeColor) document.documentElement.style.setProperty('--td-brand-color', themeColor);
    if (faviconUrl) {
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) favicon.href = faviconUrl;
    }
    if (siteName) document.title = siteName;
  },
  { immediate: true },
);

onMounted(() => {
  document.documentElement.removeAttribute('theme-mode');
  statusStore.ensurePersistSync();
  window.addEventListener('scroll', syncMenuByScroll, { passive: true });
  nextTick(syncMenuByScroll);
});

onUnmounted(() => {
  window.removeEventListener('scroll', syncMenuByScroll);
  statusStore.stopSync();
  const settingStore = useSettingStore();
  void settingStore.changeMode(settingStore.mode);
});
</script>

<style lang="less" scoped>
:global(html),
:global(body),
:global(#app) {
  min-height: 100%;
  height: auto;
  background: var(--td-bg-color-page);
}

.public-status {
  min-height: 100vh;
  height: auto !important;
  overflow: visible;
  background: var(--td-bg-color-page);
  color: var(--td-text-color-primary);

  :deep(.t-tag.t-tag--light) {
    color: var(--td-text-color-primary);
  }

  :deep(.t-tag.t-tag--light.t-tag--success) {
    color: var(--td-success-color-7, #006c45);
  }

  :deep(.t-tag.t-tag--light.t-tag--danger) {
    color: var(--td-error-color-7, #b42318);
  }

  :deep(.t-tag.t-tag--light.t-tag--warning) {
    color: var(--td-warning-color-7, #9a5b00);
  }

  :deep(.t-tag.t-tag--light.t-tag--primary) {
    color: var(--td-brand-color-7, var(--td-brand-color));
  }

  :deep(.t-divider__inner-text) {
    color: var(--td-text-color-secondary);
  }
}

.public-status__header {
  position: sticky !important;
  top: 0;
  z-index: 1001;
  padding: 0;
  height: auto !important;
  background: var(--td-bg-color-container);
  box-shadow: 0 1px 0 var(--td-component-stroke);
}

.public-status__content {
  flex: 1 0 auto;
  height: auto !important;
  padding: var(--td-comp-paddingTB-xl) var(--td-comp-paddingLR-xl);
  background: var(--td-bg-color-page);
}

.public-status__inner {
  width: 75%;
  max-width: 1200px;
  margin: 0 auto;
}

.public-status__freshness {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--td-warning-color-3);
  border-radius: var(--td-radius-medium);
  background: var(--td-warning-color-1);
  color: var(--td-text-color-primary);
  font-size: 13px;
}

.public-status__footer {
  padding: 0;
  margin-bottom: var(--td-comp-margin-xxl);
  background: var(--td-bg-color-page);
  color: var(--td-text-color-secondary);
  text-align: center;
}

@media (max-width: 1200px) {
  .public-status__inner {
    width: 90%;
  }
}

@media (max-width: 768px) {
  .public-status__inner {
    width: 100%;
  }
}
</style>
