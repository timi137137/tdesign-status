import { ROLE_PERMISSIONS } from '@/constants/roles';
import type { SessionUser, UserRole } from '@/types/auth';

import { apiFetch, jsonBody, versionHeaders } from './http';

export interface LoginPayload {
  account: string;
  password: string;
}

export interface AuthUserPayload {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  version: number;
}

interface AuthSessionPayload {
  user: AuthUserPayload;
  expiresAt?: number;
}

export const toSessionUser = (user: AuthUserPayload): SessionUser => ({
  id: user.id,
  username: user.username,
  name: user.displayName,
  role: user.role,
  permissions: ROLE_PERMISSIONS[user.role] ?? [],
  mustChangePassword: user.mustChangePassword,
  version: user.version,
});

export const authApi = {
  login: async (payload: LoginPayload) => {
    const result = await apiFetch<AuthSessionPayload>('/api/auth/login', {
      method: 'POST',
      ...jsonBody({
        username: payload.account.trim(),
        password: payload.password,
      }),
    });
    return toSessionUser(result.user);
  },
  session: async () => {
    const result = await apiFetch<AuthSessionPayload>('/api/auth/session');
    return toSessionUser(result.user);
  },
  logout: () => apiFetch<null>('/api/auth/logout', { method: 'POST' }),
  changePassword: (payload: { currentPassword: string; newPassword: string }, version: number) =>
    apiFetch<{ mustChangePassword: boolean; version: number }>('/api/auth/change-password', {
      method: 'POST',
      ...versionHeaders(version),
      ...jsonBody(payload),
    }),
};
