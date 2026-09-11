import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { hashPassword, validatePassword } from '../../auth/password';
import { revokeAllUserSessions } from '../../auth/session';
import { users } from '../../db/schema';
import { USER_ROLES } from '../../domain';
import { badRequest, conflict, notFound, ok } from '../../utils/api';
import {
  enumValue,
  expectedVersion,
  normalizeUsername,
  objectBody,
  optionalBoolean,
  optionalEnumValue,
  pagination,
  requiredBoolean,
  requiredString,
  versionEtag,
} from '../../utils/validation';
import { actorId, auditAndRebuild } from './helpers';

function userView(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    version: user.version,
    createdAt: user.createdAt,
    createdBy: user.createdBy,
    updatedAt: user.updatedAt,
    updatedBy: user.updatedBy,
  };
}

function activeAdministratorCount(app: FastifyInstance): number {
  return app.db
    .select()
    .from(users)
    .where(and(eq(users.role, 'administrator'), eq(users.isActive, true), isNull(users.deletedAt)))
    .all().length;
}

function rawPassword(body: Record<string, unknown>, required: boolean): string | undefined {
  const value = body.password;
  if (!required && (value === undefined || value === null || value === '')) return undefined;
  if (typeof value !== 'string') return badRequest('password 必须是字符串');
  validatePassword(value);
  return value;
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  const administratorOnly = requireRoles('administrator');

  app.get('/api/admin/users', { preHandler: administratorOnly }, async (request, reply) => {
    const page = pagination(request.query);
    const rows = app.db.select().from(users).where(isNull(users.deletedAt)).orderBy(asc(users.username)).all();
    return ok(reply, {
      items: rows.slice(page.offset, page.offset + page.pageSize).map(userView),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: rows.length,
        totalPages: Math.ceil(rows.length / page.pageSize),
      },
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: administratorOnly },
    async (request, reply) => {
      const user = app.db
        .select()
        .from(users)
        .where(and(eq(users.id, request.params.id), isNull(users.deletedAt)))
        .get();
      if (!user) return notFound('用户不存在');
      reply.header('ETag', versionEtag(user.version));
      return ok(reply, userView(user));
    },
  );

  app.post('/api/admin/users', { preHandler: administratorOnly }, async (request, reply) => {
    const body = objectBody(request.body);
    const password = rawPassword(body, true);
    if (!password) return badRequest('password 不能为空');
    const now = Date.now();
    const actor = actorId(request);
    const row = {
      id: randomUUID(),
      username: normalizeUsername(requiredString(body, 'username', 64)),
      displayName: requiredString(body, 'displayName', 100),
      passwordHash: await hashPassword(password),
      role: enumValue(body, 'role', USER_ROLES),
      isActive: requiredBoolean(body, 'isActive'),
      mustChangePassword: optionalBoolean(body, 'mustChangePassword') ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(row.username)) {
      return badRequest('username 仅允许 3-64 位小写字母、数字、点、下划线和连字符');
    }
    app.db.insert(users).values(row).run();
    const created = app.db.select().from(users).where(eq(users.id, row.id)).get();
    auditAndRebuild(app, request, {
      action: 'user.created',
      entityType: 'user',
      entityId: row.id,
      after: created ? userView(created) : row,
    });
    reply.header('ETag', versionEtag(1));
    return ok(reply, created ? userView(created) : null, '用户已创建', 201);
  });

  app.put<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: administratorOnly },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(users)
        .where(and(eq(users.id, request.params.id), isNull(users.deletedAt)))
        .get();
      if (!current) return notFound('用户不存在');
      const actor = actorId(request);
      const nextRole = optionalEnumValue(body, 'role', USER_ROLES) ?? current.role;
      const nextActive = optionalBoolean(body, 'isActive') ?? current.isActive;
      if (current.id === actor && (nextRole !== current.role || nextActive !== current.isActive)) {
        return badRequest('不能修改自己的角色或启用状态');
      }
      if (
        current.role === 'administrator' &&
        current.isActive &&
        (nextRole !== 'administrator' || !nextActive) &&
        activeAdministratorCount(app) <= 1
      ) {
        return badRequest('必须保留至少一个启用的 administrator');
      }

      const password = rawPassword(body, false);
      const username =
        body.username === undefined ? current.username : normalizeUsername(requiredString(body, 'username', 64));
      if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
        return badRequest('username 仅允许 3-64 位小写字母、数字、点、下划线和连字符');
      }
      const now = Date.now();
      const next = {
        username,
        displayName: body.displayName === undefined ? current.displayName : requiredString(body, 'displayName', 100),
        role: nextRole,
        isActive: nextActive,
        mustChangePassword:
          optionalBoolean(body, 'mustChangePassword') ?? (password ? true : current.mustChangePassword),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      };
      const result = app.db
        .update(users)
        .set({
          ...next,
          failedLoginCount: nextActive ? 0 : current.failedLoginCount,
          lockedUntil: nextActive ? null : current.lockedUntil,
          updatedAt: now,
          updatedBy: actor,
          version: sql`${users.version} + 1`,
        })
        .where(and(eq(users.id, current.id), eq(users.version, version), isNull(users.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      let revokedSessions = 0;
      if (password || !nextActive || nextRole !== current.role || username !== current.username) {
        revokedSessions = revokeAllUserSessions(app.db, current.id, actor);
      }
      const updated = app.db.select().from(users).where(eq(users.id, current.id)).get();
      auditAndRebuild(app, request, {
        action: 'user.updated',
        entityType: 'user',
        entityId: current.id,
        before: userView(current),
        after: updated ? userView(updated) : next,
        metadata: { revokedSessions, passwordReset: Boolean(password) },
      });
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated ? userView(updated) : null, '用户已更新');
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: administratorOnly },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(users)
        .where(and(eq(users.id, request.params.id), isNull(users.deletedAt)))
        .get();
      if (!current) return notFound('用户不存在');
      const actor = actorId(request);
      if (current.id === actor) return badRequest('不能删除当前登录用户');
      if (current.role === 'administrator' && current.isActive && activeAdministratorCount(app) <= 1) {
        return badRequest('必须保留至少一个启用的 administrator');
      }
      const now = Date.now();
      const result = app.db
        .update(users)
        .set({
          isActive: false,
          deletedAt: now,
          deletedBy: actor,
          updatedAt: now,
          updatedBy: actor,
          version: sql`${users.version} + 1`,
        })
        .where(and(eq(users.id, current.id), eq(users.version, version), isNull(users.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      const revokedSessions = revokeAllUserSessions(app.db, current.id, actor);
      auditAndRebuild(app, request, {
        action: 'user.deleted',
        entityType: 'user',
        entityId: current.id,
        before: userView(current),
        metadata: { revokedSessions },
      });
      return ok(reply, { id: current.id, version: version + 1 }, '用户已删除');
    },
  );
}
