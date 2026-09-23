<template>
  <div class="public-header">
    <button class="public-header__logo" type="button" :aria-label="`${siteTitle}，返回当前状态`" @click="onLogoClick">
      <img v-if="logoUrl" class="public-header__custom-logo" :src="logoUrl" :alt="`${siteTitle} Logo`" />
      <logo-full v-else class="public-header__logo-svg" aria-hidden="true" />
      <span class="public-header__title">{{ siteTitle }}</span>
    </button>
    <nav class="public-header__nav" aria-label="公开状态导航">
      <button
        type="button"
        class="public-header__link"
        :class="{ 'public-header__link--active': modelValue === 'current' }"
        :aria-current="modelValue === 'current' ? 'page' : undefined"
        @click="onChange('current')"
      >
        {{ navCurrent }}
      </button>
      <button
        type="button"
        class="public-header__link"
        :class="{ 'public-header__link--active': modelValue === 'history' }"
        :aria-current="modelValue === 'history' ? 'page' : undefined"
        @click="onChange('history')"
      >
        {{ navHistory }}
      </button>
    </nav>
  </div>
</template>

<script lang="ts">
export default {
  name: 'PublicHeader',
};
</script>

<script setup lang="ts">
import LogoFull from '@/assets/assets-logo-full.svg?component';

withDefaults(
  defineProps<{
    modelValue: string;
    siteTitle?: string;
    navCurrent?: string;
    navHistory?: string;
    logoUrl?: string;
  }>(),
  {
    siteTitle: '服务状态',
    navCurrent: '当前状态',
    navHistory: '历史',
    logoUrl: '',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

const onChange = (value: string) => {
  emit('update:modelValue', value);
  emit('change', value);
};

const onLogoClick = () => {
  onChange('current');
};
</script>

<style lang="less" scoped>
.public-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
}

.public-header__logo {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: var(--td-text-color-primary);
  border: 0;
  background: transparent;
}

.public-header__logo-svg {
  flex: none;
  width: 140px;
  height: 26px;
}

.public-header__custom-logo {
  flex: none;
  width: auto;
  max-width: 140px;
  height: 28px;
  object-fit: contain;
}

.public-header__title {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-header__nav {
  display: flex;
  flex: none;
  gap: 4px;
}

.public-header__link {
  padding: 16px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--td-text-color-primary);
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}

.public-header__link--active {
  border-bottom-color: var(--td-brand-color);
  color: var(--td-brand-color);
  font-weight: 600;
}

@media (max-width: 768px) {
  .public-header {
    padding: 0 16px;
  }

  .public-header__logo-svg {
    width: 96px;
  }

  .public-header__title {
    display: none;
  }
}
</style>
