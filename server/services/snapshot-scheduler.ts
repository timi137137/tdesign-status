import type { FastifyInstance } from 'fastify';

import { rebuildPublicSnapshot } from './snapshot';

const DEBOUNCE_MS = 200;

export interface SnapshotScheduler {
  /** Queue a rebuild; bursts of writes collapse into a single rebuild. */
  schedule(actorUserId?: string): void;
  /** Rebuild synchronously; used when the public page must reflect the write at once. */
  rebuildNow(actorUserId?: string): void;
  /** Rebuild immediately if one is queued. Safe to call during shutdown. */
  flush(): void;
}

export function createSnapshotScheduler(app: FastifyInstance): SnapshotScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let pendingActorUserId: string | undefined;

  const runPending = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    pending = false;
    const actorUserId = pendingActorUserId;
    pendingActorUserId = undefined;
    try {
      rebuildPublicSnapshot(app.db, actorUserId);
    } catch (error) {
      app.log.error({ err: error }, 'public snapshot rebuild failed');
    }
  };

  return {
    schedule(actorUserId) {
      pending = true;
      if (actorUserId) pendingActorUserId = actorUserId;
      if (timer) return;
      timer = setTimeout(runPending, DEBOUNCE_MS);
    },
    rebuildNow(actorUserId) {
      pending = true;
      if (actorUserId) pendingActorUserId = actorUserId;
      runPending();
    },
    flush() {
      runPending();
    },
  };
}
