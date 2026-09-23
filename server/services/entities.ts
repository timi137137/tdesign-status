import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { entityServices, services } from '../db/schema';
import type { EntityType } from '../domain';
import { badRequest } from '../utils/api';

export function syncEntityServices(
  db: AppDatabase,
  entityType: EntityType,
  entityId: string,
  serviceIds: string[],
  actorId: string,
): void {
  const uniqueIds = [...new Set(serviceIds)];
  if (uniqueIds.length > 0) {
    const valid = db
      .select({ id: services.id })
      .from(services)
      .where(and(inArray(services.id, uniqueIds), isNull(services.deletedAt)))
      .all();
    if (valid.length !== uniqueIds.length) {
      return badRequest('affectedServiceIds 包含不存在或已删除的服务');
    }
  }

  const now = Date.now();
  const existing = db
    .select()
    .from(entityServices)
    .where(and(eq(entityServices.entityType, entityType), eq(entityServices.entityId, entityId)))
    .all();
  const wanted = new Set(uniqueIds);

  for (const row of existing) {
    if (wanted.has(row.serviceId)) {
      wanted.delete(row.serviceId);
      if (row.deletedAt !== null) {
        db.update(entityServices)
          .set({
            deletedAt: null,
            deletedBy: null,
            updatedAt: now,
            updatedBy: actorId,
            version: sql`${entityServices.version} + 1`,
          })
          .where(eq(entityServices.id, row.id))
          .run();
      }
    } else if (row.deletedAt === null) {
      db.update(entityServices)
        .set({
          deletedAt: now,
          deletedBy: actorId,
          updatedAt: now,
          updatedBy: actorId,
          version: sql`${entityServices.version} + 1`,
        })
        .where(eq(entityServices.id, row.id))
        .run();
    }
  }

  for (const serviceId of wanted) {
    db.insert(entityServices)
      .values({
        id: randomUUID(),
        entityType,
        entityId,
        serviceId,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .run();
  }
}

export function softDeleteEntityServices(
  db: AppDatabase,
  entityType: EntityType,
  entityId: string,
  actorId: string,
): void {
  const now = Date.now();
  db.update(entityServices)
    .set({
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
      version: sql`${entityServices.version} + 1`,
    })
    .where(
      and(
        eq(entityServices.entityType, entityType),
        eq(entityServices.entityId, entityId),
        isNull(entityServices.deletedAt),
      ),
    )
    .run();
}
