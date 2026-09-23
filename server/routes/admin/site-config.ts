import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { siteConfigs } from '../../db/schema';
import type { SiteConfigValue } from '../../domain';
import { writeAudit } from '../../services/audit';
import { badRequest, conflict, notFound, ok } from '../../utils/api';
import { expectedVersion, objectBody, optionalString, requiredString, versionEtag } from '../../utils/validation';
import { actorId, ADMIN_READ_ROLES, auditAndRebuild, CONTENT_WRITE_ROLES } from './helpers';

function parseConfig(body: Record<string, unknown>): SiteConfigValue {
  const raw =
    body.config && typeof body.config === 'object' && !Array.isArray(body.config)
      ? (body.config as Record<string, unknown>)
      : body;
  const logoUrl = optionalString(raw, 'logoUrl', 2000) ?? '';
  const supportUrl = optionalString(raw, 'supportUrl', 2000) ?? '';
  for (const value of [logoUrl, supportUrl]) {
    if (value) {
      try {
        new URL(value);
      } catch {
        return badRequest('logoUrl/supportUrl 必须是绝对 URL');
      }
    }
  }
  return {
    siteName: requiredString(raw, 'siteName', 100),
    title: requiredString(raw, 'title', 200),
    description: requiredString(raw, 'description', 2000),
    locale: requiredString(raw, 'locale', 20),
    timezone: requiredString(raw, 'timezone', 100),
    logoUrl,
    supportUrl,
    componentSubtitle:
      optionalString(raw, 'componentSubtitle', 200) ?? '通栏为近 24 小时探测；双列半宽为近 30 日状态。',
    historySubtitle: optionalString(raw, 'historySubtitle', 200) ?? '按开始时间倒序。完整进展请打开详情。',
    footerText: optionalString(raw, 'footerText', 200) ?? requiredString(raw, 'siteName', 100),
    adminFooterText:
      optionalString(raw, 'adminFooterText', 200) ??
      `Copyright © 2021-${new Date().getFullYear()} Tencent. All Rights Reserved`,
  };
}

export async function registerSiteConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/site-config', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (_request, reply) => {
    const row = app.db
      .select()
      .from(siteConfigs)
      .where(and(eq(siteConfigs.id, 'default'), isNull(siteConfigs.deletedAt)))
      .get();
    if (!row) return notFound('站点配置不存在，请先执行 seed');
    reply.header('ETag', versionEtag(row.version));
    return ok(reply, row);
  });

  app.put(
    '/api/admin/site-config/draft',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body);
      const version = expectedVersion(request, body);
      const config = parseConfig(body);
      const current = app.db
        .select()
        .from(siteConfigs)
        .where(and(eq(siteConfigs.id, 'default'), isNull(siteConfigs.deletedAt)))
        .get();
      if (!current) return notFound('站点配置不存在，请先执行 seed');
      const now = Date.now();
      const result = app.db
        .update(siteConfigs)
        .set({
          draftJson: config,
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${siteConfigs.version} + 1`,
        })
        .where(and(eq(siteConfigs.id, 'default'), eq(siteConfigs.version, version), isNull(siteConfigs.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      writeAudit(app.db, request, {
        action: 'site_config.draft_updated',
        entityType: 'site_config',
        entityId: 'default',
        before: current.draftJson,
        after: config,
      });
      const updated = app.db.select().from(siteConfigs).where(eq(siteConfigs.id, 'default')).get();
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated, '草稿已保存');
    },
  );

  app.post(
    '/api/admin/site-config/publish',
    { preHandler: requireRoles(...CONTENT_WRITE_ROLES) },
    async (request, reply) => {
      const body = objectBody(request.body ?? {});
      const version = expectedVersion(request, body);
      const current = app.db
        .select()
        .from(siteConfigs)
        .where(and(eq(siteConfigs.id, 'default'), isNull(siteConfigs.deletedAt)))
        .get();
      if (!current) return notFound('站点配置不存在，请先执行 seed');
      const now = Date.now();
      const result = app.db
        .update(siteConfigs)
        .set({
          publishedJson: current.draftJson,
          publishedAt: now,
          updatedAt: now,
          updatedBy: actorId(request),
          version: sql`${siteConfigs.version} + 1`,
        })
        .where(and(eq(siteConfigs.id, 'default'), eq(siteConfigs.version, version), isNull(siteConfigs.deletedAt)))
        .run();
      if (result.changes === 0) return conflict();
      auditAndRebuild(app, request, {
        action: 'site_config.published',
        entityType: 'site_config',
        entityId: 'default',
        before: current.publishedJson,
        after: current.draftJson,
      });
      const updated = app.db.select().from(siteConfigs).where(eq(siteConfigs.id, 'default')).get();
      reply.header('ETag', versionEtag(version + 1));
      return ok(reply, updated, '站点配置已发布');
    },
  );
}
