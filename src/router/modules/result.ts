import { retryImport } from '@/utils/retry-import';

export default [
  {
    path: '/result',
    name: 'result',
    component: retryImport(() => import('@/layouts/index.vue')),
    redirect: '/result/404',
    meta: { title: '结果页', icon: 'check-circle', hidden: true },
    children: [
      {
        path: 'success',
        name: 'ResultSuccess',
        component: retryImport(() => import('@/pages/result/success/index.vue')),
        meta: { title: '成功页', hidden: true },
      },
      {
        path: 'fail',
        name: 'ResultFail',
        component: retryImport(() => import('@/pages/result/fail/index.vue')),
        meta: { title: '失败页', hidden: true },
      },
      {
        path: 'network-error',
        name: 'ResultNetworkError',
        component: retryImport(() => import('@/pages/result/network-error/index.vue')),
        meta: { title: '网络异常', hidden: true },
      },
      {
        path: '403',
        name: 'Result403',
        component: retryImport(() => import('@/pages/result/403/index.vue')),
        meta: { title: '无权限', hidden: true },
      },
      {
        path: '404',
        name: 'Result404',
        component: retryImport(() => import('@/pages/result/404/index.vue')),
        meta: { title: '访问页面不存在页', hidden: true },
      },
      {
        path: '500',
        name: 'Result500',
        component: retryImport(() => import('@/pages/result/500/index.vue')),
        meta: { title: '服务器出错页', hidden: true },
      },
      {
        path: 'browser-incompatible',
        name: 'ResultBrowserIncompatible',
        component: retryImport(() => import('@/pages/result/browser-incompatible/index.vue')),
        meta: { title: '浏览器不兼容页', hidden: true },
      },
      {
        path: 'maintenance',
        name: 'ResultMaintenance',
        component: retryImport(() => import('@/pages/result/maintenance/index.vue')),
        meta: { title: '系统维护页', hidden: true },
      },
    ],
  },
];
