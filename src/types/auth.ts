export type UserRole = 'administrator' | 'publisher' | 'viewer';

export type Permission =
  | 'dashboard:read'
  | 'site:read'
  | 'site:write'
  | 'service:read'
  | 'service:write'
  | 'incident:read'
  | 'incident:write'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'publish'
  | 'user:manage'
  | 'audit:read';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  mustChangePassword: boolean;
  version: number;
}
