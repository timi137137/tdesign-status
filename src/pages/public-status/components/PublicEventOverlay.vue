<template>
  <t-drawer
    :visible="showDrawer"
    attach="body"
    placement="right"
    :header="header"
    :footer="false"
    :size="PUBLIC_DETAIL_DRAWER_SIZE"
    drawer-class-name="public-event-drawer"
    :lazy="true"
    :destroy-on-close="true"
    :prevent-scroll-through="true"
    :close-on-overlay-click="true"
    :show-overlay="true"
    :z-index="2500"
    @update:visible="onDrawerVisible"
  >
    <event-detail v-if="showDrawer && eventId" :id="eventId" :kind="kind" />
  </t-drawer>

  <t-dialog
    :visible="showDialog"
    attach="body"
    :header="header"
    :footer="false"
    :close-btn="true"
    :destroy-on-close="true"
    :prevent-scroll-through="true"
    :close-on-overlay-click="true"
    :show-overlay="true"
    placement="center"
    width="92%"
    dialog-class-name="public-event-dialog"
    :z-index="2500"
    @update:visible="onDialogVisible"
  >
    <event-detail v-if="showDialog && eventId" :id="eventId" :kind="kind" />
  </t-dialog>
</template>

<script lang="ts">
export default {
  name: 'PublicEventOverlay',
};
</script>

<script setup lang="ts">
import { computed, defineAsyncComponent, toRef } from 'vue';

import { PUBLIC_DETAIL_DRAWER_SIZE } from '@/constants/status';

import { usePublicDrawerScrollLock } from '../use-drawer-scroll-lock';
import { useIsMobile } from '../use-is-mobile';

const EventDetail = defineAsyncComponent(() => import('../event-detail.vue'));

const props = defineProps<{
  visible: boolean;
  header: string;
  kind: 'incident' | 'maintenance';
  eventId: string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  close: [];
}>();

const isMobile = useIsMobile();
const showDrawer = computed(() => props.visible && !isMobile.value);
const showDialog = computed(() => props.visible && isMobile.value);

usePublicDrawerScrollLock(toRef(props, 'visible'));

const onDrawerVisible = (value: boolean) => {
  if (isMobile.value) return;
  emit('update:visible', value);
  if (!value) emit('close');
};

const onDialogVisible = (value: boolean) => {
  if (!isMobile.value) return;
  emit('update:visible', value);
  if (!value) emit('close');
};
</script>

<style lang="less" scoped>
:global(.public-event-drawer.t-drawer--right .t-drawer__content-wrapper--right) {
  width: 480px;
  max-width: 92vw;
}

:global(.public-event-drawer .t-drawer__body) {
  overflow-y: auto;
  overscroll-behavior: contain;
}

:global(.public-event-dialog .t-dialog__body) {
  max-height: min(70vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (max-width: 768px) {
  :global(.public-event-dialog .t-dialog) {
    width: 92% !important;
    max-width: 92vw;
  }

  :global(.public-event-dialog .t-dialog__body) {
    max-height: 70vh;
  }
}

:global(html.public-status-drawer-lock),
:global(body.public-status-drawer-lock) {
  overflow: hidden !important;
}

:global(.tdesign-wrapper.public-status-drawer-lock) {
  overflow: hidden !important;
  overscroll-behavior: none;
}
</style>
