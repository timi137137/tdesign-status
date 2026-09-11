import { createRouter, createWebHistory, RouteRecordRaw, useRoute } from 'vue-router';

import { retryImport } from '@/utils/retry-import';

import homepageModules from './modules/homepage';
import resultModules from './modules/result';
import statusModules from './modules/status';
import systemModules from './modules/system';
import userModules from './modules/user';

const env = import.meta.env.MODE || 'development';

// 其他固定路由
const defaultRouterList: Array<RouteRecordRaw> = [
  {
    path: '/login',
    name: 'login',
    component: retryImport(() => import('@/pages/login/index.vue')),
  },
  {
    path: '/',
    component: retryImport(() => import('@/pages/public-status/layout.vue')),
    meta: {
      title: '服务状态',
      hidden: true,
      public: true,
    },
    children: [
      {
        path: '',
        name: 'PublicStatus',
        component: retryImport(() => import('@/pages/public-status/index.vue')),
        meta: {
          title: '服务状态',
          hidden: true,
          public: true,
        },
      },
      {
        path: 'maintenances',
        name: 'PublicMaintenances',
        component: retryImport(() => import('@/pages/public-status/maintenances.vue')),
        meta: {
          title: '计划与进行中的维护',
          hidden: true,
          public: true,
        },
      },
      {
        path: 'history',
        name: 'PublicHistory',
        component: retryImport(() => import('@/pages/public-status/history.vue')),
        meta: {
          title: '事件与维护历史',
          hidden: true,
          public: true,
        },
      },
      {
        path: 'incident/:id',
        name: 'PublicIncidentDetail',
        redirect: (to) => ({ path: '/', query: { kind: 'incident', id: String(to.params.id) } }),
        meta: {
          title: '事件详情',
          hidden: true,
          public: true,
        },
      },
      {
        path: 'maintenance/:id',
        name: 'PublicMaintenanceDetail',
        redirect: (to) => ({ path: '/', query: { kind: 'maintenance', id: String(to.params.id) } }),
        meta: {
          title: '维护详情',
          hidden: true,
          public: true,
        },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/result/404',
    meta: {
      title: '页面不存在',
      hidden: true,
    },
  },
];
export const homepageRouterList = [...homepageModules] as RouteRecordRaw[];
export const fixedRouterList = [
  ...statusModules,
  ...resultModules,
  ...systemModules,
  ...userModules,
] as RouteRecordRaw[];

export const allRoutes = [...homepageRouterList, ...fixedRouterList, ...defaultRouterList];

export const getRoutesExpanded = () => {
  const expandedRoutes: Array<string> = [];

  fixedRouterList.forEach((item) => {
    if (item.meta && item.meta.expanded) {
      expandedRoutes.push(item.path);
    }
    if (item.children && item.children.length > 0) {
      item.children
        .filter((child) => child.meta && child.meta.expanded)
        .forEach((child: RouteRecordRaw) => {
          expandedRoutes.push(item.path);
          expandedRoutes.push(`${item.path}/${child.path}`);
        });
    }
  });
  return [...new Set(expandedRoutes)];
};

export const getActive = (maxLevel = 3): string => {
  const route = useRoute();
  if (!route?.path) {
    return '';
  }
  return route.path
    .split('/')
    .filter((_item: string, index: number) => index <= maxLevel && index > 0)
    .map((item: string) => `/${item}`)
    .join('');
};

const router = createRouter({
  history: createWebHistory(env === 'site' ? '/starter/vue-next/' : import.meta.env.VITE_BASE_URL),
  routes: allRoutes,
  scrollBehavior() {
    return {
      el: '#app',
      top: 0,
      behavior: 'smooth',
    };
  },
});

export default router;
