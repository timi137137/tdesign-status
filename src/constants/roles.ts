import type { Permission, UserRole } from '@/types/auth';

export const ROLE_LABEL: Record<UserRole, string> = {
  administrator: '管理员',
  publisher: '发布者',
  viewer: '只读',
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  administrator: [
    'dashboard:read',
    'site:read',
    'site:write',
    'service:read',
    'service:write',
    'incident:read',
    'incident:write',
    'maintenance:read',
    'maintenance:write',
    'publish',
    'user:manage',
    'audit:read',
  ],
  publisher: [
    'dashboard:read',
    'site:read',
    'site:write',
    'service:read',
    'service:write',
    'incident:read',
    'incident:write',
    'maintenance:read',
    'maintenance:write',
    'publish',
  ],
  viewer: ['dashboard:read', 'site:read', 'service:read', 'incident:read', 'maintenance:read'],
};
