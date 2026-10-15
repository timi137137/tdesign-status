import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { auditLogs, incidents, maintenances, publicSnapshots, services, siteConfigs, users } from '../../db/schema';
import { ok } from '../../utils/api';
import { ADMIN_READ_ROLES, countRows, incidentView, maintenanceView } from './helpers';

const ACTIVE_PREVIEW_LIMIT = 10;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/dashboard', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const serviceRows = app.db.select().from(services).where(isNull(services.deletedAt)).all();
    const activeIncidentRows = app.db
      .select()
      .from(incidents)
      .where(and(isNull(incidents.deletedAt), ne(incidents.status, 'resolved')))
      .orderBy(desc(incidents.startedAt))
      .limit(ACTIVE_PREVIEW_LIMIT)
      .all();
    const activeMaintenanceRows = app.db
      .select()
      .from(maintenances)
      .where(and(isNull(maintenances.deletedAt), ne(maintenances.status, 'completed')))
      .orderBy(desc(maintenances.scheduledStart))
      .limit(ACTIVE_PREVIEW_LIMIT)
      .all();
    const recentAudit = app.db
      .select()
      .from(auditLogs)
      .where(isNull(auditLogs.deletedAt))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10)
      .all();
    const config = app.db.select().from(siteConfigs).where(isNull(siteConfigs.deletedAt)).get();
    const snapshot = app.db
      .select({
        etag: publicSnapshots.etag,
        lastModified: publicSnapshots.lastModified,
        version: publicSnapshots.version,
      })
      .from(publicSnapshots)
      .where(isNull(publicSnapshots.deletedAt))
      .get();

    return ok(reply, {
      counts: {
        services: countRows(app, services, isNull(services.deletedAt)),
        enabledServices: countRows(app, services, and(isNull(services.deletedAt), eq(services.enabled, true))),
        activeIncidents: countRows(app, incidents, and(isNull(incidents.deletedAt), ne(incidents.status, 'resolved'))),
        scheduledMaintenances: countRows(
          app,
          maintenances,
          and(isNull(maintenances.deletedAt), ne(maintenances.status, 'completed')),
        ),
        users: countRows(app, users, isNull(users.deletedAt)),
        activeUsers: countRows(app, users, and(isNull(users.deletedAt), eq(users.isActive, true))),
      },
      services: [...serviceRows].sort((left, right) => left.position - right.position),
      activeIncidents: activeIncidentRows.map((item) => incidentView(app, item)),
      activeMaintenances: activeMaintenanceRows.map((item) => maintenanceView(app, item)),
      siteConfig: config,
      snapshot,
      recentAudit: request.principal?.role === 'administrator' ? recentAudit : [],
    });
  });
}
