import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { entityServices, type IncidentRow, type MaintenanceRow } from '../../db/schema';
import type { EntityType, UserRole } from '../../domain';
import { type AuditInput, writeAudit } from '../../services/audit';
import { materializeIncident, materializeMaintenance, rebuildPublicSnapshot } from '../../services/snapshot';
import { unauthorized } from '../../utils/api';

export const ADMIN_READ_ROLES: UserRole[] = ['administrator', 'publisher', 'viewer'];
export const CONTENT_WRITE_ROLES: UserRole[] = ['administrator', 'publisher'];

export function actorId(request: FastifyRequest): string {
  if (!request.principal) return unauthorized();
  return request.principal.id;
}

export function queryObject(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === '' || value === undefined || value === null) continue;
    result[key] = value;
  }
  return result;
}

export function entityIdsForService(app: FastifyInstance, entityType: EntityType, serviceId: string): Set<string> {
  return new Set(
    app.db
      .select({ entityId: entityServices.entityId })
      .from(entityServices)
      .where(
        and(
          eq(entityServices.entityType, entityType),
          eq(entityServices.serviceId, serviceId),
          isNull(entityServices.deletedAt),
        ),
      )
      .all()
      .map((row) => row.entityId),
  );
}

export function incidentView(app: FastifyInstance, row: IncidentRow) {
  const materialized = materializeIncident(app.db, row);
  return {
    ...row,
    affectedServiceIds: materialized.affectedServiceIds,
    updates: materialized.updates,
  };
}

export function maintenanceView(app: FastifyInstance, row: MaintenanceRow) {
  const materialized = materializeMaintenance(app.db, row);
  return {
    ...row,
    affectedServiceIds: materialized.affectedServiceIds,
    updates: materialized.updates,
  };
}

export function auditAndRebuild(app: FastifyInstance, request: FastifyRequest, input: AuditInput): void {
  writeAudit(app.db, request, input);
  rebuildPublicSnapshot(app.db, actorId(request));
}
