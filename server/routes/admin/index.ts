import type { FastifyInstance } from 'fastify';

import { registerAuditRoutes } from './audit';
import { registerDashboardRoutes } from './dashboard';
import { registerIncidentRoutes } from './incidents';
import { registerLayoutRoutes } from './layout';
import { registerMaintenanceRoutes } from './maintenances';
import { registerServiceRoutes } from './services';
import { registerSiteConfigRoutes } from './site-config';
import { registerUserRoutes } from './users';

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await registerDashboardRoutes(app);
  await registerSiteConfigRoutes(app);
  await registerServiceRoutes(app);
  await registerIncidentRoutes(app);
  await registerMaintenanceRoutes(app);
  await registerUserRoutes(app);
  await registerAuditRoutes(app);
  await registerLayoutRoutes(app);
}
