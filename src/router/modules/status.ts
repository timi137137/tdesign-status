import { retryImport } from '@/utils/retry-import';

export default [
  {
    path: '/status',
    component: retryImport(() => import('@/layouts/index.vue')),
    redirect: '/status/services',
    name: 'status',
    meta: {
      title: '服务状态',
      icon: 'precise-monitor',
      orderNo: 1,
      permissions: ['site:read', 'service:read', 'incident:read', 'maintenance:read'],
    },
    children: [
      {
        path: 'site',
        name: 'StatusSite',
        component: retryImport(() => import('@/pages/status-admin/site/index.vue')),
        meta: {
          title: '站点设置',
          keepAlive: false,
          permissions: ['site:read'],
        },
      },
      {
        path: 'services',
        name: 'StatusServices',
        component: retryImport(() => import('@/pages/status-admin/services/index.vue')),
        meta: {
          title: '服务配置',
          keepAlive: false,
          permissions: ['service:read'],
        },
      },
      {
        path: 'incidents',
        name: 'StatusIncidents',
        component: retryImport(() => import('@/pages/status-admin/incidents/index.vue')),
        meta: {
          title: '事件管理',
          keepAlive: false,
          permissions: ['incident:read'],
        },
      },
      {
        path: 'incidents/:id',
        name: 'StatusIncidentDetail',
        component: retryImport(() => import('@/pages/status-admin/incidents/detail.vue')),
        meta: {
          title: '事件详情',
          hidden: true,
          keepAlive: false,
          permissions: ['incident:read'],
        },
      },
      {
        path: 'maintenances',
        name: 'StatusMaintenances',
        component: retryImport(() => import('@/pages/status-admin/maintenances/index.vue')),
        meta: {
          title: '维护计划',
          keepAlive: false,
          permissions: ['maintenance:read'],
        },
      },
      {
        path: 'maintenances/:id',
        name: 'StatusMaintenanceDetail',
        component: retryImport(() => import('@/pages/status-admin/maintenances/detail.vue')),
        meta: {
          title: '维护详情',
          hidden: true,
          keepAlive: false,
          permissions: ['maintenance:read'],
        },
      },
    ],
  },
];
