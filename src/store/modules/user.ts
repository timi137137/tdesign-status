import { defineStore } from 'pinia';

import { authApi, type LoginPayload } from '@/api/auth';
import { usePermissionStore } from '@/store/modules/permission';
import type { UserInfo } from '@/types/interface';

const InitUserInfo: UserInfo = {
  id: '',
  username: '',
  name: '',
  role: 'viewer',
  permissions: [],
  mustChangePassword: false,
  version: 0,
};

export const useUserStore = defineStore('user', {
  state: () => ({
    userInfo: { ...InitUserInfo },
    sessionChecked: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.userInfo.id),
    permissions: (state) => state.userInfo.permissions,
  },
  actions: {
    async login(payload: LoginPayload) {
      this.userInfo = await authApi.login(payload);
      this.sessionChecked = true;
      usePermissionStore().initRoutes();
    },
    async getUserInfo() {
      if (this.sessionChecked) return this.userInfo;
      try {
        this.userInfo = await authApi.session();
      } catch {
        this.userInfo = { ...InitUserInfo };
      } finally {
        this.sessionChecked = true;
        usePermissionStore().initRoutes();
      }
      return this.userInfo;
    },
    async changePassword(payload: { currentPassword: string; newPassword: string }) {
      const result = await authApi.changePassword(payload, this.userInfo.version);
      this.userInfo.mustChangePassword = result.mustChangePassword;
      this.userInfo.version = result.version;
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        this.clearSession();
      }
    },
    clearSession() {
      this.userInfo = { ...InitUserInfo };
      this.sessionChecked = true;
      usePermissionStore().initRoutes();
    },
  },
});
