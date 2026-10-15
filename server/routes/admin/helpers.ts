import type { SQL } from 'drizzle-orm';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { IncidentRow, MaintenanceRow } from '../../db/schema';
import { entityServices } from '../../db/schema';
import type { EntityType, UserRole } from '../../domain';
import type { AuditInput } from '../../services/audit';
import { writeAudit } from '../../services/audit';
import { materializeIncident, materializeMaintenance } from '../../services/snapshot';
import { unauthorized } from '../../utils/api';

export const ADMIN_READ_ROLES: UserRole[] = ['administrator', 'publisher', 'viewer'];
export const CONTENT_WRITE_ROLES: UserRole[] = ['administrator', 'publisher'];

export function countRows(app: FastifyInstance, table: SQLiteTable, where?: SQL): number {
  const rows = app.db.select({ value: count() }).from(table);
  return (where ? rows.where(where) : rows).get()?.value ?? 0;
}

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
  app.snapshotScheduler.schedule(actorId(request));
}

/**
 * Audits and rebuilds the public snapshot before the response is sent. Used by
 * publish actions, where the public page must reflect the new content at once.
 */
export function auditAndRebuildNow(app: FastifyInstance, request: FastifyRequest, input: AuditInput): void {
  writeAudit(app.db, request, input);
  app.snapshotScheduler.rebuildNow(actorId(request));
}
