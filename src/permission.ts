import router from '@/router';
import { getPermissionStore } from '@/store/modules/permission';
import { useUserStore } from '@/store/modules/user';
import type { Permission } from '@/types/auth';

router.beforeEach(async (to, _from, next) => {
  const permissionStore = getPermissionStore();
  const { whiteListRouters } = permissionStore;
  const userStore = useUserStore();
  const isPublic = whiteListRouters.includes(to.path) || to.matched.some((record) => record.meta?.public);

  if (!userStore.sessionChecked) {
    await userStore.getUserInfo();
  }

  if (to.path === '/login') {
    if (userStore.isAuthenticated) next('/dashboard/overview');
    else next();
    return;
  }

  if (isPublic) {
    next();
    return;
  }

  if (!userStore.isAuthenticated) {
    next({
      path: '/login',
      query: { redirect: encodeURIComponent(to.fullPath) },
    });
    return;
  }

  const required = to.matched.flatMap((record) => (record.meta.permissions || []) as Permission[]);
  if (required.length && !required.some((permission) => userStore.permissions.includes(permission))) {
    next('/result/403');
    return;
  }

  if (userStore.userInfo.mustChangePassword && to.path !== '/user/index') {
    next({ path: '/user/index', query: { action: 'change-password' } });
    return;
  }

  next();
});

router.afterEach((to) => {
  document.title = `${to.meta.title || '服务状态'} - 腾讯服务状态`;
});
