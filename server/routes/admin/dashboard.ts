import { desc, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireRoles } from '../../auth/guards';
import { auditLogs, incidents, maintenances, publicSnapshots, services, siteConfigs, users } from '../../db/schema';
import { ok } from '../../utils/api';
import { ADMIN_READ_ROLES, incidentView, maintenanceView } from './helpers';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/dashboard', { preHandler: requireRoles(...ADMIN_READ_ROLES) }, async (request, reply) => {
    const serviceRows = app.db.select().from(services).where(isNull(services.deletedAt)).all();
    const incidentRows = app.db
      .select()
      .from(incidents)
      .where(isNull(incidents.deletedAt))
      .orderBy(desc(incidents.startedAt))
      .all();
    const maintenanceRows = app.db
      .select()
      .from(maintenances)
      .where(isNull(maintenances.deletedAt))
      .orderBy(desc(maintenances.scheduledStart))
      .all();
    const userRows = app.db.select().from(users).where(isNull(users.deletedAt)).all();
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
        services: serviceRows.length,
        enabledServices: serviceRows.filter((item) => item.enabled).length,
        activeIncidents: incidentRows.filter((item) => item.status !== 'resolved').length,
        scheduledMaintenances: maintenanceRows.filter((item) => item.status !== 'completed').length,
        users: userRows.length,
        activeUsers: userRows.filter((item) => item.isActive).length,
      },
      services: serviceRows.sort((left, right) => left.position - right.position),
      activeIncidents: incidentRows
        .filter((item) => item.status !== 'resolved')
        .slice(0, 10)
        .map((item) => incidentView(app, item)),
      activeMaintenances: maintenanceRows
        .filter((item) => item.status !== 'completed')
        .slice(0, 10)
        .map((item) => maintenanceView(app, item)),
      siteConfig: config,
      snapshot,
      recentAudit: request.principal?.role === 'administrator' ? recentAudit : [],
    });
  });
}
