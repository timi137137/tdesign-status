<template>
  <div v-if="offlineReady || needRefresh" class="pwa-prompt" role="status" aria-live="polite">
    <span>{{ needRefresh ? '发现新版本，刷新后生效。' : '页面已可在弱网或离线时继续打开。' }}</span>
    <button v-if="needRefresh" type="button" @click="updateServiceWorker(true)">立即刷新</button>
    <button type="button" aria-label="关闭提示" @click="close">关闭</button>
  </div>
</template>

<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

const close = () => {
  needRefresh.value = false;
  offlineReady.value = false;
};
</script>

<style lang="less" scoped>
.pwa-prompt {
  position: fixed;
  z-index: 3000;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 16px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-2);
  color: var(--td-text-color-primary);

  button {
    border: 0;
    background: transparent;
    color: var(--td-brand-color);
    cursor: pointer;
  }
}
</style>
