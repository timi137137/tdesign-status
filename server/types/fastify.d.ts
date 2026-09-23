import type { ServerConfig } from '../config';
import type { AppDatabase } from '../db/client';
import type { SessionPrincipal } from '../domain';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: ServerConfig;
    db: AppDatabase;
  }

  interface FastifyRequest {
    principal: SessionPrincipal | null;
  }
}

export {};
