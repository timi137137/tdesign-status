import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { burnPasswordVerification, hashPassword, validatePassword, verifyPassword } from '../auth/password';
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  revokeOtherUserSessions,
  revokeSession,
  setSessionCookie,
} from '../auth/session';
import { users } from '../db/schema';
import { writeAudit } from '../services/audit';
import { rebuildPublicSnapshot } from '../services/snapshot';
import { ApiError, conflict, ok, unauthorized } from '../utils/api';
import { expectedVersion, normalizeUsername, objectBody, requiredString, versionEtag } from '../utils/validation';

const MAX_FAILED_LOGINS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

function passwordField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length > 256) {
    throw new ApiError(400, 'BAD_REQUEST', `${key} 格式不正确`);
  }
  return value;
}

function publicUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
  version: number;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    version: user.version,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: app.appConfig.loginRateLimitMax,
          timeWindow: app.appConfig.loginRateLimitWindow,
        },
      },
    },
    async (request, reply) => {
      const body = objectBody(request.body);
      const username = normalizeUsername(requiredString(body, 'username', 64));
      const password = passwordField(body, 'password');
      const now = Date.now();
      const user = app.db
        .select()
        .from(users)
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
        .get();

      if (!user || !user.isActive) {
        await burnPasswordVerification(password);
        return unauthorized('用户名或密码错误');
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (user.lockedUntil && user.lockedUntil > now) {
        throw new ApiError(429, 'LOGIN_LOCKED', '登录失败次数过多，请稍后重试');
      }
      if (!valid) {
        const failedLoginCount = user.failedLoginCount + 1;
        const lockedUntil = failedLoginCount >= MAX_FAILED_LOGINS ? now + ACCOUNT_LOCK_MS : null;
        app.db
          .update(users)
          .set({
            failedLoginCount,
            lockedUntil,
            updatedAt: now,
            version: sql`${users.version} + 1`,
          })
          .where(and(eq(users.id, user.id), eq(users.version, user.version)))
          .run();
        writeAudit(app.db, request, {
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user.id,
          metadata: { failedLoginCount },
        });
        return unauthorized('用户名或密码错误');
      }

      const updateResult = app.db
        .update(users)
        .set({
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
          updatedAt: now,
          version: sql`${users.version} + 1`,
        })
        .where(and(eq(users.id, user.id), eq(users.version, user.version)))
        .run();
      if (updateResult.changes === 0) return conflict();

      const session = createSession(app.db, app.appConfig, user.id, request.ip, request.headers['user-agent']);
      setSessionCookie(reply, app.appConfig, session.token);
      writeAudit(app.db, request, {
        action: 'auth.login_succeeded',
        entityType: 'session',
        entityId: session.sessionId,
        actorUserId: user.id,
      });

      const responseUser = publicUser({ ...user, version: user.version + 1 });
      reply.header('ETag', versionEtag(responseUser.version));
      return ok(reply, {
        user: responseUser,
        expiresAt: session.expiresAt,
      });
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = readSessionToken(request, app.appConfig);
    if (token) revokeSession(app.db, token, request.principal?.id);
    clearSessionCookie(reply, app.appConfig);
    if (request.principal) {
      writeAudit(app.db, request, {
        action: 'auth.logout',
        entityType: 'session',
        entityId: request.principal.sessionId,
      });
    }
    return ok(reply, null, '已退出登录');
  });

  app.get('/api/auth/session', async (request, reply) => {
    if (!request.principal) return unauthorized();
    reply.header('ETag', versionEtag(request.principal.userVersion));
    return ok(reply, {
      user: {
        id: request.principal.id,
        username: request.principal.username,
        displayName: request.principal.displayName,
        role: request.principal.role,
        mustChangePassword: request.principal.mustChangePassword,
        version: request.principal.userVersion,
      },
    });
  });

  app.post('/api/auth/change-password', async (request, reply) => {
    const { principal } = request;
    if (!principal) return unauthorized();
    const body = objectBody(request.body);
    const version = expectedVersion(request, body);
    const currentPassword = passwordField(body, 'currentPassword');
    const newPassword = passwordField(body, 'newPassword');
    validatePassword(newPassword);
    if (currentPassword === newPassword) {
      throw new ApiError(400, 'BAD_REQUEST', '新密码不能与当前密码相同');
    }

    const user = app.db
      .select()
      .from(users)
      .where(and(eq(users.id, principal.id), isNull(users.deletedAt)))
      .get();
    if (!user || !user.isActive) return unauthorized();
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return unauthorized('当前密码不正确');
    }

    const newHash = await hashPassword(newPassword);
    const now = Date.now();
    const result = app.db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
        updatedBy: user.id,
        version: sql`${users.version} + 1`,
      })
      .where(and(eq(users.id, user.id), eq(users.version, version)))
      .run();
    if (result.changes === 0) return conflict();

    const revokedSessions = revokeOtherUserSessions(app.db, user.id, principal.sessionId);
    writeAudit(app.db, request, {
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
      before: { mustChangePassword: user.mustChangePassword, version: user.version },
      after: { mustChangePassword: false, version: version + 1 },
      metadata: { revokedSessions },
    });
    rebuildPublicSnapshot(app.db, user.id);
    reply.header('ETag', versionEtag(version + 1));
    return ok(
      reply,
      {
        mustChangePassword: false,
        version: version + 1,
        revokedSessions,
      },
      '密码已修改',
    );
  });
}
