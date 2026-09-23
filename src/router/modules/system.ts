import { retryImport } from '@/utils/retry-import';

export default [
  {
    path: '/system',
    component: retryImport(() => import('@/layouts/index.vue')),
    redirect: '/system/users',
    name: 'system',
    meta: {
      title: '系统管理',
      icon: 'setting',
      orderNo: 2,
      permissions: ['user:manage', 'audit:read'],
    },
    children: [
      {
        path: 'users',
        name: 'SystemUsers',
        component: retryImport(() => import('@/pages/system/users/index.vue')),
        meta: {
          title: '用户与角色',
          permissions: ['user:manage'],
        },
      },
      {
        path: 'audit',
        name: 'SystemAudit',
        component: retryImport(() => import('@/pages/system/audit/index.vue')),
        meta: {
          title: '审计日志',
          permissions: ['audit:read'],
        },
      },
    ],
  },
];
