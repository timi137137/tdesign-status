import { randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { AppDatabase } from '../db/client';
import { auditLogs } from '../db/schema';
import type { JsonObject } from '../domain';
import { auditJson } from '../utils/validation';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: JsonObject;
  actorUserId?: string;
}

export function writeAudit(db: AppDatabase, request: FastifyRequest | null, input: AuditInput): string {
  const now = Date.now();
  const actorUserId = input.actorUserId ?? request?.principal?.id;
  const id = randomUUID();
  db.insert(auditLogs)
    .values({
      id,
      actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: request?.id,
      ipAddress: request?.ip,
      userAgent: request?.headers['user-agent']?.slice(0, 500),
      beforeJson: auditJson(input.before),
      afterJson: auditJson(input.after),
      metadataJson: input.metadata,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    })
    .run();
  return id;
}
