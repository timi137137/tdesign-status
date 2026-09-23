import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ServerConfig } from '../config';
import type { AppDatabase } from '../db/client';
import { sessions, users } from '../db/schema';
import type { SessionPrincipal } from '../domain';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function readSessionToken(request: FastifyRequest, config: ServerConfig): string | undefined {
  const token = request.cookies[config.cookieName];
  return typeof token === 'string' && token.length <= 256 ? token : undefined;
}

export function setSessionCookie(reply: FastifyReply, config: ServerConfig, token: string): void {
  reply.setCookie(config.cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: Math.floor(config.sessionTtlMs / 1000),
    priority: 'high',
  });
}

export function clearSessionCookie(reply: FastifyReply, config: ServerConfig): void {
  reply.clearCookie(config.cookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
  });
}

export function createSession(
  db: AppDatabase,
  config: ServerConfig,
  userId: string,
  ipAddress: string,
  userAgent: string | undefined,
): { token: string; sessionId: string; expiresAt: number } {
  const now = Date.now();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const expiresAt = now + config.sessionTtlMs;

  db.insert(sessions)
    .values({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt,
      lastSeenAt: now,
      ipAddress,
      userAgent: userAgent?.slice(0, 500),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    })
    .run();

  return { token, sessionId, expiresAt };
}

export function loadPrincipal(db: AppDatabase, token: string): SessionPrincipal | null {
  const now = Date.now();
  const tokenHash = hashSessionToken(token);
  const row = db
    .select({
      sessionId: sessions.id,
      sessionTokenHash: sessions.tokenHash,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      userVersion: users.version,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt),
        isNull(sessions.deletedAt),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    )
    .get();

  if (!row) return null;

  if (now - row.lastSeenAt >= TOUCH_INTERVAL_MS) {
    db.update(sessions)
      .set({
        lastSeenAt: now,
        updatedAt: now,
        version: sql`${sessions.version} + 1`,
      })
      .where(eq(sessions.id, row.sessionId))
      .run();
  }

  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    userVersion: row.userVersion,
    sessionId: row.sessionId,
    sessionTokenHash: row.sessionTokenHash,
  };
}

export function revokeSession(db: AppDatabase, token: string, actorId?: string): boolean {
  const now = Date.now();
  const result = db
    .update(sessions)
    .set({
      revokedAt: now,
      deletedAt: now,
      deletedBy: actorId,
      updatedBy: actorId,
      updatedAt: now,
      version: sql`${sessions.version} + 1`,
    })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt), isNull(sessions.deletedAt)))
    .run();
  return result.changes > 0;
}

export function revokeOtherUserSessions(db: AppDatabase, userId: string, currentSessionId: string): number {
  const now = Date.now();
  const result = db
    .update(sessions)
    .set({
      revokedAt: now,
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: sql`${sessions.version} + 1`,
    })
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
        isNull(sessions.revokedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .run();
  return result.changes;
}

export function revokeAllUserSessions(db: AppDatabase, userId: string, actorId: string): number {
  const now = Date.now();
  const result = db
    .update(sessions)
    .set({
      revokedAt: now,
      deletedAt: now,
      deletedBy: actorId,
      updatedBy: actorId,
      updatedAt: now,
      version: sql`${sessions.version} + 1`,
    })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), isNull(sessions.deletedAt)))
    .run();
  return result.changes;
}
