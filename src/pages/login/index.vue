<template>
  <div class="login-wrapper">
    <login-header />

    <div class="login-container">
      <div class="title-container">
        <h1 class="title margin-no">登录到</h1>
        <h1 class="title">服务状态管理后台</h1>
        <div class="sub-title">
          <p class="tip">{{ type == 'register' ? '已有账号?' : '没有账号吗?' }}</p>
          <p class="tip" @click="switchType(type == 'register' ? 'login' : 'register')">
            {{ type == 'register' ? '登录' : '注册新账号' }}
          </p>
        </div>
      </div>

      <login v-if="type === 'login'" />
      <register v-else @register-success="switchType('login')" />
      <tdesign-setting />
    </div>

    <footer class="copyright">{{ footerText }}</footer>
  </div>
</template>
<script lang="ts">
export default {
  name: 'LoginIndex',
};
</script>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import TdesignSetting from '@/layouts/setting.vue';
import { useStatusStore } from '@/store';

import LoginHeader from './components/Header.vue';
import Login from './components/Login.vue';
import Register from './components/Register.vue';

const type = ref('login');
const statusStore = useStatusStore();
const footerText = computed(
  () => statusStore.siteConfig.text.adminFooterText || statusStore.siteConfig.text.footerText,
);
const switchType = (val: string) => {
  type.value = val;
};

onMounted(() => {
  void statusStore.loadSnapshot();
});
</script>

<style lang="less" scoped>
@import './index.less';
</style>
