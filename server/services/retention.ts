import { and, isNotNull, lt, or } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { auditLogs, serviceSamples, serviceStateEvents, sessions } from '../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Single source of truth for how long each unbounded table is kept.
 * Raw samples are only needed for the 24-hour heartbeat bar, so they are dropped
 * long before the state intervals that carry the 60-day history.
 */
export const RETENTION_DAYS = {
  sessions: 7,
  auditLogs: 180,
  serviceSamples: 2,
  serviceStateEvents: 400,
} as const;

export interface RetentionResult {
  sessions: number;
  auditLogs: number;
  serviceSamples: number;
  serviceStateEvents: number;
}

export function runRetentionSweep(db: AppDatabase, now = Date.now()): RetentionResult {
  const sessionCutoff = now - RETENTION_DAYS.sessions * DAY_MS;
  const auditCutoff = now - RETENTION_DAYS.auditLogs * DAY_MS;
  const sampleCutoff = now - RETENTION_DAYS.serviceSamples * DAY_MS;
  const stateEventCutoff = now - RETENTION_DAYS.serviceStateEvents * DAY_MS;

  const sessionsDeleted = db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, sessionCutoff),
        and(isNotNull(sessions.deletedAt), lt(sessions.deletedAt, sessionCutoff)),
      ),
    )
    .run();
  const auditDeleted = db.delete(auditLogs).where(lt(auditLogs.createdAt, auditCutoff)).run();
  const samplesDeleted = db.delete(serviceSamples).where(lt(serviceSamples.observedAt, sampleCutoff)).run();
  const stateEventsDeleted = db.delete(serviceStateEvents).where(lt(serviceStateEvents.at, stateEventCutoff)).run();

  return {
    sessions: sessionsDeleted.changes,
    auditLogs: auditDeleted.changes,
    serviceSamples: samplesDeleted.changes,
    serviceStateEvents: stateEventsDeleted.changes,
  };
}
