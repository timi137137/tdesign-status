import { retryImport } from '@/utils/retry-import';

export default [
  {
    path: '/user',
    name: 'user',
    component: retryImport(() => import('@/layouts/index.vue')),
    redirect: '/user/index',
    meta: { title: '个人页', hidden: true, permissions: ['dashboard:read'] },
    children: [
      {
        path: 'index',
        name: 'UserIndex',
        component: retryImport(() => import('@/pages/user/index.vue')),
        meta: { title: '个人中心', hidden: true, permissions: ['dashboard:read'] },
      },
    ],
  },
];
