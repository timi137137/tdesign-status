import 'vue-router';

import type { Permission } from './auth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    hidden?: boolean;
    public?: boolean;
    keepAlive?: boolean;
    orderNo?: number;
    expanded?: boolean;
    single?: boolean;
    permissions?: Permission[];
  }
}
