import type { preHandlerHookHandler } from 'fastify';

import type { UserRole } from '../domain';
import { ApiError, forbidden, unauthorized } from '../utils/api';

export const requireAuthenticated: preHandlerHookHandler = async (request) => {
  if (!request.principal) return unauthorized();
  if (request.principal.mustChangePassword) {
    throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '首次登录必须先修改密码');
  }
};

export function requireRoles(...roles: UserRole[]): preHandlerHookHandler {
  return async (request) => {
    if (!request.principal) return unauthorized();
    if (request.principal.mustChangePassword) {
      throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '首次登录必须先修改密码');
    }
    if (!roles.includes(request.principal.role)) return forbidden();
  };
}
