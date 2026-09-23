<template>
  <main class="audit-admin" aria-labelledby="audit-admin-title">
    <header class="page-header">
      <div>
        <h1 id="audit-admin-title">审计日志</h1>
        <p>按动作、对象类型和时间范围查询管理操作记录。</p>
      </div>
    </header>

    <t-card :bordered="false">
      <form class="filters" aria-label="审计筛选" @submit.prevent="applyFilters">
        <label class="filter-field">
          <span>动作</span>
          <t-input v-model="filterForm.action" clearable placeholder="例如 user.updated" aria-label="按动作筛选" />
        </label>
        <label class="filter-field">
          <span>对象类型</span>
          <t-select
            v-model="filterForm.entityType"
            clearable
            placeholder="全部"
            :options="entityOptions"
            aria-label="按对象类型筛选"
          />
        </label>
        <label class="filter-field filter-range">
          <span>时间范围</span>
          <t-date-range-picker
            v-model="filterForm.range"
            enable-time-picker
            clearable
            placeholder="开始时间 - 结束时间"
            aria-label="按时间范围筛选"
          />
        </label>
        <div class="filter-actions">
          <t-button theme="primary" type="submit">查询</t-button>
          <t-button variant="outline" type="button" @click="clearFilters">清除</t-button>
        </div>
      </form>

      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载审计日志" />
      </div>
      <t-alert v-else-if="loadError" theme="error" title="审计日志加载失败" :message="loadError">
        <template #operation>
          <t-button variant="text" @click="() => loadAudit()">重试</t-button>
        </template>
      </t-alert>
      <t-empty v-else-if="items.length === 0" description="没有符合条件的审计记录" />
      <template v-else>
        <t-table row-key="id" :data="items" :columns="columns" :hover="true" table-layout="fixed" aria-label="审计日志">
          <template #createdAt="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
          <template #actor="{ row }">
            {{ row.actorUserId || '系统' }}
          </template>
          <template #entity="{ row }">
            <div class="entity">
              <strong>{{ row.entityType }}</strong>
              <code v-if="row.entityId">{{ row.entityId }}</code>
            </div>
          </template>
        </t-table>
        <div class="pagination">
          <t-pagination :current="page" :page-size="pageSize" :total="total" show-jumper @change="onPaginationChange" />
        </div>
      </template>
    </t-card>
  </main>
</template>

<script lang="ts">
export default {
  name: 'SystemAudit',
};
</script>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { adminApi, type AdminAuditLog } from '@/api/admin';
import { formatStatusTime } from '@/utils/status-date';

const emptyFilters = () => ({
  action: '',
  entityType: '',
  range: [] as string[],
});

const items = ref<AdminAuditLog[]>([]);
const loading = ref(true);
const loadError = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filterForm = reactive(emptyFilters());
const activeFilters = reactive(emptyFilters());

const entityOptions = [
  { label: '用户', value: 'user' },
  { label: '会话', value: 'session' },
  { label: '站点配置', value: 'site_config' },
  { label: '服务', value: 'service' },
  { label: '事件', value: 'incident' },
  { label: '维护', value: 'maintenance' },
  { label: '仪表盘布局', value: 'dashboard_layout' },
];

const columns = [
  { colKey: 'createdAt', title: '时间', width: 170 },
  { colKey: 'action', title: '动作', width: 220 },
  { colKey: 'entity', title: '对象' },
  { colKey: 'actor', title: '操作者', width: 280 },
];

const formatTime = (value: number) => formatStatusTime(value);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const rangeToQuery = () => {
  const [from, to] = activeFilters.range;
  return {
    action: activeFilters.action.trim() || undefined,
    entityType: activeFilters.entityType || undefined,
    from: from ? Date.parse(from) : undefined,
    to: to ? Date.parse(to) : undefined,
  };
};

const loadAudit = async (nextPage = page.value) => {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminApi.audit.list({
      page: nextPage,
      pageSize: pageSize.value,
      ...rangeToQuery(),
    });
    items.value = result.items;
    page.value = result.pagination.page;
    pageSize.value = result.pagination.pageSize;
    total.value = result.pagination.total;
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  Object.assign(activeFilters, { ...filterForm, range: [...filterForm.range] });
  loadAudit(1);
};

const clearFilters = () => {
  Object.assign(filterForm, emptyFilters());
  Object.assign(activeFilters, emptyFilters());
  loadAudit(1);
};

interface PaginationChangeContext {
  current: number;
  pageSize: number;
}

const onPaginationChange = (context: PaginationChangeContext) => {
  pageSize.value = context.pageSize;
  loadAudit(context.current);
};

onMounted(() => {
  loadAudit();
});
</script>

<style lang="less" scoped>
.audit-admin {
  display: grid;
  gap: 16px;
}

.page-header {
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

.filters {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(160px, 1fr) minmax(280px, 1.4fr) auto;
  gap: 16px;
  align-items: end;
  margin-bottom: 20px;
}

.filter-field {
  display: grid;
  gap: 6px;
  color: var(--td-text-color-secondary);
  font-size: 14px;
}

.filter-actions {
  display: flex;
  gap: 12px;
}

.state-panel {
  display: grid;
  min-height: 240px;
  place-items: center;
}

.entity {
  display: grid;
  gap: 4px;

  code {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
    word-break: break-all;
  }
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (width <= 768px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
