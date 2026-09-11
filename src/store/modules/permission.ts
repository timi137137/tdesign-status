import { defineStore } from 'pinia';

import { fixedRouterList, homepageRouterList } from '@/router';
import { store } from '@/store/pinia';
import type { Permission } from '@/types/auth';
import type { MenuRoute } from '@/types/interface';

import { useUserStore } from './user';

const canAccess = (permissions: Permission[], route: MenuRoute) => {
  const required = route.meta?.permissions as Permission[] | undefined;
  return !required?.length || required.some((permission) => permissions.includes(permission));
};

const filterRoutes = (routes: MenuRoute[], permissions: Permission[]): MenuRoute[] =>
  routes.reduce<MenuRoute[]>((result, route) => {
    if (!canAccess(permissions, route)) return result;
    const hadChildren = Boolean(route.children?.length);
    const children = hadChildren ? filterRoutes(route.children, permissions) : [];
    if (hadChildren && !children.length) return result;
    result.push({ ...route, children });
    return result;
  }, []);

export const usePermissionStore = defineStore('permission', {
  state: () => ({
    whiteListRouters: ['/login', '/', '/maintenances', '/history'],
    routers: [] as MenuRoute[],
  }),
  actions: {
    initRoutes() {
      const { permissions } = useUserStore();
      const routes = [...homepageRouterList, ...fixedRouterList] as unknown as MenuRoute[];
      this.routers = filterRoutes(routes, permissions);
    },
  },
});

export function getPermissionStore() {
  return usePermissionStore(store);
}
