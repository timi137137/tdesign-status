<template>
  <main class="user-admin" aria-labelledby="user-admin-title">
    <header class="page-header">
      <div>
        <h1 id="user-admin-title">用户与角色</h1>
        <p>管理登录账号、角色与启用状态。至少保留一名启用的管理员。</p>
      </div>
      <t-button theme="primary" :disabled="!isOnline" @click="openCreate">新建用户</t-button>
    </header>

    <t-alert v-if="!isOnline" theme="warning" title="当前处于离线状态" message="恢复联网前不能创建、编辑或删除用户。" />

    <t-card :bordered="false">
      <div v-if="loading" class="state-panel" role="status" aria-live="polite">
        <t-loading text="正在加载用户" />
      </div>
      <t-alert v-else-if="loadError" theme="error" title="用户加载失败" :message="loadError">
        <template #operation>
          <t-button variant="text" @click="() => loadUsers()">重试</t-button>
        </template>
      </t-alert>
      <template v-else>
        <t-table row-key="id" :data="users" :columns="columns" :hover="true" table-layout="fixed" aria-label="用户列表">
          <template #role="{ row }">
            {{ roleLabel(row.role) }}
          </template>
          <template #status="{ row }">
            <t-tag :theme="row.isActive ? 'success' : 'default'" variant="light">
              {{ row.isActive ? '启用' : '停用' }}
            </t-tag>
          </template>
          <template #lastLoginAt="{ row }">
            {{ row.lastLoginAt ? formatTime(row.lastLoginAt) : '从未登录' }}
          </template>
          <template #operation="{ row }">
            <t-space>
              <t-button
                size="small"
                variant="text"
                :disabled="!isOnline"
                :aria-label="`编辑用户${row.username}`"
                @click="openEdit(row)"
              >
                编辑
              </t-button>
              <t-button
                size="small"
                theme="danger"
                variant="text"
                :disabled="!isOnline || row.id === currentUserId"
                :aria-label="`删除用户${row.username}`"
                @click="removeUser(row)"
              >
                删除
              </t-button>
            </t-space>
          </template>
        </t-table>
        <div class="pagination">
          <t-pagination :current="page" :page-size="pageSize" :total="total" show-jumper @change="onPaginationChange" />
        </div>
      </template>
    </t-card>

    <t-dialog
      v-model:visible="dialogVisible"
      :header="editingUser ? '编辑用户' : '新建用户'"
      :width="560"
      :footer="false"
      :close-on-overlay-click="!saving"
    >
      <t-form :data="form" :rules="rules" :label-width="120" @submit="submitUser">
        <t-form-item label="用户名" name="username">
          <t-input
            v-model="form.username"
            :maxlength="64"
            placeholder="小写字母、数字、点、下划线或连字符"
            :disabled="saving"
          />
        </t-form-item>
        <t-form-item label="显示名称" name="displayName">
          <t-input v-model="form.displayName" :maxlength="100" :disabled="saving" />
        </t-form-item>
        <t-form-item label="角色" name="role">
          <t-select v-model="form.role" :options="roleOptions" :disabled="saving || isSelf" aria-label="选择角色" />
        </t-form-item>
        <t-form-item label="启用" name="isActive">
          <t-switch v-model="form.isActive" :disabled="saving || isSelf" aria-label="启用该账号" />
        </t-form-item>
        <t-form-item :label="editingUser ? '重置密码' : '初始密码'" name="password">
          <t-input
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            :placeholder="editingUser ? '留空表示不修改' : '至少 12 位，需同时包含字母和数字'"
            :disabled="saving"
          />
        </t-form-item>
        <t-form-item label="下次登录改密" name="mustChangePassword">
          <t-switch v-model="form.mustChangePassword" :disabled="saving" aria-label="要求下次登录修改密码" />
        </t-form-item>
        <t-form-item>
          <t-space>
            <t-button theme="primary" type="submit" :loading="saving">保存</t-button>
            <t-button variant="outline" type="button" :disabled="saving" @click="dialogVisible = false">取消</t-button>
          </t-space>
        </t-form-item>
      </t-form>
    </t-dialog>
  </main>
</template>

<script lang="ts">
export default {
  name: 'SystemUsers',
};
</script>

<script setup lang="ts">
import { DialogPlugin, MessagePlugin, type SubmitContext } from 'tdesign-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import { adminApi, type AdminUser } from '@/api/admin';
import { ApiError } from '@/api/http';
import { ROLE_LABEL } from '@/constants/roles';
import { useUserStore } from '@/store';
import type { UserRole } from '@/types/auth';
import { formatStatusTime } from '@/utils/status-date';

const userStore = useUserStore();
const users = ref<AdminUser[]>([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const dialogVisible = ref(false);
const editingUser = ref<AdminUser | null>(null);
const isOnline = ref(navigator.onLine);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const form = reactive({
  username: '',
  displayName: '',
  role: 'viewer' as UserRole,
  isActive: true,
  password: '',
  mustChangePassword: true,
});

const currentUserId = computed(() => userStore.userInfo.id);
const isSelf = computed(() => editingUser.value?.id === currentUserId.value);
const roleOptions = (Object.keys(ROLE_LABEL) as UserRole[]).map((value) => ({
  label: ROLE_LABEL[value],
  value,
}));
const roleLabel = (role: UserRole) => ROLE_LABEL[role];
const formatTime = (value: number) => formatStatusTime(value);

const columns = [
  { colKey: 'username', title: '用户名', width: 140 },
  { colKey: 'displayName', title: '显示名称' },
  { colKey: 'role', title: '角色', width: 110 },
  { colKey: 'status', title: '状态', width: 90 },
  { colKey: 'lastLoginAt', title: '最近登录', width: 170 },
  { colKey: 'operation', title: '操作', width: 140 },
];

const rules = computed(() => ({
  username: [{ required: true, message: '请输入用户名', type: 'error' as const }],
  displayName: [{ required: true, message: '请输入显示名称', type: 'error' as const }],
  role: [{ required: true, message: '请选择角色', type: 'error' as const }],
  password: editingUser.value ? [] : [{ required: true, message: '请输入初始密码', type: 'error' as const }],
}));

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '发生未知错误，请稍后重试');

const loadUsers = async (nextPage = page.value) => {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await adminApi.users.list({ page: nextPage, pageSize: pageSize.value });
    users.value = result.items;
    page.value = result.pagination.page;
    pageSize.value = result.pagination.pageSize;
    total.value = result.pagination.total;
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  form.username = '';
  form.displayName = '';
  form.role = 'viewer';
  form.isActive = true;
  form.password = '';
  form.mustChangePassword = true;
};

const openCreate = () => {
  editingUser.value = null;
  resetForm();
  dialogVisible.value = true;
};

const openEdit = (user: AdminUser) => {
  editingUser.value = user;
  form.username = user.username;
  form.displayName = user.displayName;
  form.role = user.role;
  form.isActive = user.isActive;
  form.password = '';
  form.mustChangePassword = user.mustChangePassword;
  dialogVisible.value = true;
};

const handleConflict = async (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) {
    MessagePlugin.error('版本冲突：该用户已被其他管理员修改，列表已刷新。');
    await loadUsers();
    return true;
  }
  return false;
};

const submitUser = async (context: SubmitContext) => {
  if (context.validateResult !== true || !isOnline.value) return;
  saving.value = true;
  try {
    const payload = {
      username: form.username.trim(),
      displayName: form.displayName.trim(),
      role: form.role,
      isActive: form.isActive,
      mustChangePassword: form.mustChangePassword,
      ...(form.password ? { password: form.password } : {}),
    };
    if (editingUser.value) {
      await adminApi.users.update(editingUser.value.id, editingUser.value.version, payload);
      MessagePlugin.success('用户已更新');
    } else {
      await adminApi.users.create({ ...payload, password: form.password });
      MessagePlugin.success('用户已创建');
    }
    dialogVisible.value = false;
    await loadUsers(1);
  } catch (error) {
    if (!(await handleConflict(error))) MessagePlugin.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
};

const removeUser = (user: AdminUser) => {
  const dialog = DialogPlugin.confirm({
    header: '删除用户',
    body: `确认删除 ${user.username}？该账号将立即失效，已登录会话会被撤销。`,
    confirmBtn: '删除',
    theme: 'danger',
    onConfirm: async () => {
      try {
        await adminApi.users.remove(user.id, user.version);
        MessagePlugin.success('用户已删除');
        await loadUsers();
      } catch (error) {
        if (!(await handleConflict(error))) MessagePlugin.error(errorMessage(error));
      } finally {
        dialog.hide();
      }
    },
  });
};

interface PaginationChangeContext {
  current: number;
  pageSize: number;
}

const onPaginationChange = (context: PaginationChangeContext) => {
  pageSize.value = context.pageSize;
  loadUsers(context.current);
};

onMounted(() => {
  window.addEventListener('online', () => {
    isOnline.value = true;
  });
  window.addEventListener('offline', () => {
    isOnline.value = false;
  });
  loadUsers();
});
</script>

<style lang="less" scoped>
.user-admin {
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

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (width <= 768px) {
  .page-header {
    flex-direction: column;
  }
}
</style>
