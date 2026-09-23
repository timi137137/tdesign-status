import { existsSync } from 'node:fs';
import path from 'node:path';

import staticPlugin from '@fastify/static';
import { and, count, eq, isNull } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';

import { loadConfig, type ServerConfig } from './config';
import { openDatabase } from './db/client';
import { applyMigrations } from './db/migrate';
import { publicSnapshots, users } from './db/schema';
import { seedFreshDatabase } from './db/seed';
import { registerSecurity } from './plugins/security';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerPublicRoutes } from './routes/public';
import { ApiError, ok } from './utils/api';

function apiErrorPayload(code: string, message: string, data: unknown = null) {
  return { code, data, message };
}

export async function buildApp(config: ServerConfig = loadConfig()): Promise<FastifyInstance> {
  const database = openDatabase(config);
  try {
    applyMigrations(database, config.migrationsPath);
    if (config.autoSeed) {
      if (!process.env.STATUS_ADMIN_USERNAME || !process.env.STATUS_ADMIN_PASSWORD) {
        process.stderr.write('STATUS_AUTO_SEED 已开启但缺少 STATUS_ADMIN_USERNAME/PASSWORD，跳过自动 seed\n');
      } else {
        await seedFreshDatabase(database, { requireAdminEnv: true });
      }
    }
  } catch (error) {
    database.close();
    throw error;
  }

  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: config.trustProxy,
    bodyLimit: config.bodyLimit,
    forceCloseConnections: 'idle',
    requestIdHeader: 'x-request-id',
    disableRequestLogging: config.env === 'test',
  });

  app.decorate('appConfig', config);
  app.decorate('db', database.db);

  app.addHook('onClose', async () => {
    database.close();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(apiErrorPayload(error.code, error.message, error.data));
    }

    const sqliteCode = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : '';
    if (sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
      return reply.code(409).send(apiErrorPayload('CONSTRAINT_CONFLICT', '数据违反唯一性或关联约束'));
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'request failed');
    let message = '请求处理失败';
    if (statusCode >= 500 && config.env === 'production') {
      message = '服务器内部错误';
    } else if (error instanceof Error) {
      message = error.message;
    }
    return reply
      .code(statusCode)
      .send(apiErrorPayload(statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message));
  });

  await registerSecurity(app);
  await registerAuthRoutes(app);
  await registerPublicRoutes(app);
  await registerAdminRoutes(app);

  app.get('/api/health/live', async (_request, reply) =>
    ok(reply, {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now(),
    }),
  );

  app.get('/api/health/ready', async (_request, reply) => {
    database.sqlite.prepare('SELECT 1').get();
    const userCount =
      app.db
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
        .get()?.value ?? 0;
    const snapshot = app.db
      .select({ id: publicSnapshots.id, lastModified: publicSnapshots.lastModified })
      .from(publicSnapshots)
      .where(and(eq(publicSnapshots.id, 'current'), isNull(publicSnapshots.deletedAt)))
      .get();
    const ready = userCount > 0 && Boolean(snapshot);
    return ok(
      reply,
      {
        status: ready ? 'ready' : 'seed-required',
        database: 'ok',
        seeded: userCount > 0,
        snapshot: snapshot ?? null,
        timestamp: Date.now(),
      },
      ready ? 'ready' : '数据库迁移完成但尚未显式 seed',
      ready ? 200 : 503,
    );
  });

  app.get('/api/health', async (_request, reply) =>
    ok(reply, {
      status: 'ok',
      timestamp: Date.now(),
    }),
  );

  const hasStaticSite = existsSync(config.distPath);
  if (hasStaticSite) {
    await app.register(staticPlugin, {
      root: config.distPath,
      prefix: '/',
      wildcard: true,
      cacheControl: true,
      etag: true,
      lastModified: true,
      setHeaders(reply, filePath) {
        const base = path.basename(filePath);
        if (base === 'index.html' || base === 'sw.js' || base === 'sw.mjs' || base === 'manifest.webmanifest') {
          reply.header('Cache-Control', 'no-cache');
          return;
        }
        if (config.env === 'production') {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0];
    if (pathname.startsWith('/api/')) {
      return reply.code(404).send(apiErrorPayload('NOT_FOUND', 'API 路由不存在'));
    }
    const looksLikeAsset =
      pathname.startsWith('/assets/') ||
      pathname === '/sw.js' ||
      pathname === '/sw.mjs' ||
      pathname === '/manifest.webmanifest' ||
      pathname === '/favicon.ico' ||
      /\.(?:js|mjs|css|map|ico|png|svg|webp|woff2?|txt|webmanifest)$/i.test(pathname);
    if (looksLikeAsset) {
      return reply.code(404).send('Not Found');
    }
    if (hasStaticSite && request.method === 'GET') {
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send('Not Found');
  });

  return app;
}
