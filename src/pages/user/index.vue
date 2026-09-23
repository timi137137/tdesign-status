<template>
  <t-alert
    v-if="userStore.userInfo.mustChangePassword"
    theme="warning"
    title="必须修改密码"
    message="首次登录或管理员重置后，请在「修改密码」页签设置新密码。"
    style="margin-bottom: 16px"
  />
  <t-row :gutter="[24, 24]">
    <t-col :flex="3">
      <div class="user-left-greeting">
        <div>
          Hi，{{ displayName }}
          <span class="regular"> {{ greeting }}</span>
        </div>
        <img src="@/assets/assets-tencent-logo.png" class="logo" />
      </div>

      <t-card class="user-info-list" title="个人信息" :bordered="false">
        <template #actions>
          <t-button theme="default" shape="square" variant="text">
            <t-icon name="ellipsis" />
          </t-button>
        </template>
        <t-row class="content" justify="space-between">
          <t-col v-for="(item, index) in USER_INFO_LIST" :key="index" class="contract" :span="item.span ?? 3">
            <div class="contract-title">
              {{ item.title }}
            </div>
            <div class="contract-detail">
              {{ item.content }}
            </div>
          </t-col>
        </t-row>
      </t-card>

      <t-card class="content-container" :bordered="false">
        <t-tabs value="second">
          <t-tab-panel value="first" label="内容列表">
            <p>内容列表</p>
          </t-tab-panel>
          <t-tab-panel value="second" label="内容列表">
            <t-card :bordered="false" class="card-padding-no" title="服务可用率" describe="（%）">
              <template #actions>
                <t-date-range-picker
                  class="card-date-picker-container"
                  :default-value="LAST_7_DAYS"
                  theme="primary"
                  mode="date"
                  @change="onLineChange"
                />
              </template>
              <div id="lineContainer" style="width: 100%; height: 328px" />
            </t-card>
          </t-tab-panel>
          <t-tab-panel value="third" label="修改密码">
            <t-form :data="passwordForm" :rules="passwordRules" :label-width="110" @submit="submitPassword">
              <t-form-item label="当前密码" name="currentPassword">
                <t-input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" />
              </t-form-item>
              <t-form-item label="新密码" name="newPassword">
                <t-input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" />
              </t-form-item>
              <t-form-item>
                <t-button theme="primary" type="submit" :loading="savingPassword">保存新密码</t-button>
              </t-form-item>
            </t-form>
          </t-tab-panel>
        </t-tabs>
      </t-card>
    </t-col>

    <t-col :flex="1">
      <t-card class="user-intro" :bordered="false">
        <t-avatar size="80px">{{ avatarLetter }}</t-avatar>
        <div class="name">{{ displayName }}</div>
        <div class="position">{{ roleLabel }} · {{ userStore.userInfo.username }}</div>
      </t-card>

      <t-card title="团队成员" class="user-team" :bordered="false">
        <template #actions>
          <t-button theme="default" shape="square" variant="text">
            <t-icon name="ellipsis" />
          </t-button>
        </template>
        <t-list :split="false">
          <t-list-item v-for="(item, index) in teamMembers" :key="index">
            <t-list-item-meta :image="item.avatar" :title="item.title" :description="item.description" />
          </t-list-item>
        </t-list>
      </t-card>

      <t-card title="服务产品" class="product-container" :bordered="false">
        <template #actions>
          <t-button theme="default" shape="square" variant="text">
            <t-icon name="ellipsis" />
          </t-button>
        </template>
        <t-row class="content" :gutter="16">
          <t-col v-for="(item, index) in productItems" :key="index" :span="3">
            <div class="product-item">
              <component :is="getIcon(item.key)"></component>
              <p>{{ item.name }}</p>
            </div>
          </t-col>
        </t-row>
      </t-card>
    </t-col>
  </t-row>
</template>
<script lang="ts">
export default {
  name: 'UserIndex',
};
</script>
<script setup lang="ts">
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { DateRangeValue, SubmitContext } from 'tdesign-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { adminApi } from '@/api/admin';
import ProductAIcon from '@/assets/assets-product-1.svg';
import ProductBIcon from '@/assets/assets-product-2.svg';
import ProductCIcon from '@/assets/assets-product-3.svg';
import ProductDIcon from '@/assets/assets-product-4.svg';
import { ROLE_LABEL } from '@/constants/roles';
import { useSettingStore, useUserStore } from '@/store';
import { changeChartsTheme } from '@/utils/color';
import { LAST_7_DAYS } from '@/utils/date';

import { PRODUCT_LIST, TEAM_MEMBERS, type TeamMember } from './constants';
import { getFolderLineDataSet, type UserChartSeries } from './index';

echarts.use([GridComponent, TooltipComponent, LineChart, CanvasRenderer, LegendComponent]);

let lineContainer: HTMLElement;
let lineChart: echarts.ECharts;
const store = useSettingStore();
const userStore = useUserStore();
const router = useRouter();
const chartColors = computed(() => store.chartColors);
const displayName = computed(() => userStore.userInfo.name || userStore.userInfo.username || '未命名');
const roleLabel = computed(() => ROLE_LABEL[userStore.userInfo.role] || userStore.userInfo.role);
const avatarLetter = computed(() => displayName.value.slice(0, 1).toUpperCase());
const greeting = computed(() => {
  const hour = new Date().getHours();
  const hello = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
  return `${hello}，当前角色是${roleLabel.value}。`;
});
const USER_INFO_LIST = computed(() => [
  { title: '用户名', content: userStore.userInfo.username || '—' },
  { title: '显示名称', content: displayName.value },
  { title: '角色', content: roleLabel.value },
  { title: '权限', content: `${userStore.userInfo.permissions.length} 项` },
  { title: '账号状态', content: userStore.userInfo.mustChangePassword ? '需要修改密码' : '正常', span: 6 },
]);
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
});
const passwordRules = {
  currentPassword: [{ required: true, message: '请输入当前密码', type: 'error' as const }],
  newPassword: [
    { required: true, message: '请输入新密码', type: 'error' as const },
    { min: 8, message: '新密码至少 8 位', type: 'error' as const },
  ],
};
const savingPassword = ref(false);
const teamMembers = ref<TeamMember[]>([...TEAM_MEMBERS]);
const productItems = ref<Array<{ key: string; name: string }>>([]);
const chartSeries = ref<UserChartSeries[]>([]);

const letterAvatar = (name: string) => {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="#0052d9" width="40" height="40"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-size="18" font-family="sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const currentUserAsMember = (): TeamMember => ({
  avatar: letterAvatar(displayName.value),
  title: displayName.value,
  description: `${roleLabel.value} · ${userStore.userInfo.username}`,
});

const buildChartOption = (dateTime?: string[]) =>
  getFolderLineDataSet({
    dateTime,
    series: chartSeries.value,
    ...chartColors.value,
  });

const loadProfileExtras = async () => {
  try {
    if (userStore.permissions.includes('user:manage')) {
      const result = await adminApi.users.list({ page: 1, pageSize: 8 });
      teamMembers.value = result.items.map((item) => ({
        avatar: letterAvatar(item.displayName || item.username),
        title: item.displayName || item.username,
        description: `${ROLE_LABEL[item.role] || item.role} · ${item.username}`,
      }));
    } else {
      teamMembers.value = [currentUserAsMember()];
    }
  } catch {
    teamMembers.value = [currentUserAsMember()];
  }

  try {
    const overview = await adminApi.dashboard();
    const services = overview.services.filter((item) => item.enabled).slice(0, 4);
    productItems.value = services.map((item, index) => ({
      key: PRODUCT_LIST[index] || 'a',
      name: item.name,
    }));
    chartSeries.value = services.map((item) => ({
      name: item.name,
      data: Array.from({ length: 7 }, () => Number(item.uptime.toFixed(2))),
    }));
    if (lineChart) {
      lineChart.setOption(buildChartOption());
    }
  } catch {
    productItems.value = [];
    chartSeries.value = [];
  }
};
const submitPassword = async (ctx: SubmitContext) => {
  if (ctx.validateResult !== true || savingPassword.value) return;
  savingPassword.value = true;
  try {
    await userStore.changePassword(passwordForm);
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    MessagePlugin.success('密码已更新');
    if (router.currentRoute.value.query.action === 'change-password') {
      await router.replace('/dashboard/overview');
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '修改密码失败');
  } finally {
    savingPassword.value = false;
  }
};

const onLineChange = (value: DateRangeValue) => {
  lineChart.setOption(buildChartOption(value as string[]));
};

const initChart = () => {
  lineContainer = document.getElementById('lineContainer');
  lineChart = echarts.init(lineContainer);
  lineChart.setOption({
    grid: {
      x: 30,
      y: 30,
      x2: 10,
      y2: 30,
    },
    ...buildChartOption(),
  });
};

const updateContainer = () => {
  lineChart?.resize({
    width: lineContainer.clientWidth,
    height: lineContainer.clientHeight,
  });
};

onMounted(() => {
  nextTick(() => {
    initChart();
  });
  window.addEventListener('resize', updateContainer, false);
  void loadProfileExtras();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateContainer);
});

const getIcon = (type: string) => {
  switch (type) {
    case 'a':
      return ProductAIcon;
    case 'b':
      return ProductBIcon;
    case 'c':
      return ProductCIcon;
    case 'd':
      return ProductDIcon;
    default:
      return ProductAIcon;
  }
};

watch(
  () => store.brandTheme,
  () => {
    changeChartsTheme([lineChart]);
  },
);
</script>

<style lang="less" scoped>
@import url('./index.less');
</style>
