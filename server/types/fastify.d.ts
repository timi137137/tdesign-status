import type { ServerConfig } from '../config';
import type { AppDatabase } from '../db/client';
import type { SessionPrincipal } from '../domain';
import type { SnapshotScheduler } from '../services/snapshot-scheduler';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: ServerConfig;
    db: AppDatabase;
    snapshotScheduler: SnapshotScheduler;
  }

  interface FastifyRequest {
    principal: SessionPrincipal | null;
  }
}

export {};
