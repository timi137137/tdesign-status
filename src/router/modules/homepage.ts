import { retryImport } from '@/utils/retry-import';

export default [
  {
    path: '/dashboard',
    component: retryImport(() => import('@/layouts/index.vue')),
    redirect: '/dashboard/overview',
    name: 'dashboard',
    meta: {
      title: '仪表盘',
      icon: 'dashboard',
      orderNo: 0,
      single: true,
      permissions: ['dashboard:read'],
    },
    children: [
      {
        path: 'overview',
        name: 'DashboardOverview',
        component: retryImport(() => import('@/pages/dashboard/overview/index.vue')),
        meta: {
          title: '运营概览',
          permissions: ['dashboard:read'],
        },
      },
    ],
  },
];
