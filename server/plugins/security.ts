import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { loadPrincipal, readSessionToken } from '../auth/session';
import { ApiError } from '../utils/api';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(request: FastifyRequest): string | null {
  const { host } = request.headers;
  if (!host) return null;
  try {
    return new URL(`${request.protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function validateOrigin(app: FastifyInstance, request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;

  const originHeader = request.headers.origin;
  if (!originHeader) {
    throw new ApiError(403, 'ORIGIN_REQUIRED', '写操作必须携带 Origin 请求头');
  }

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Origin 请求头无效');
  }

  const configured = app.appConfig.allowedOrigins;
  const sameOrigin = requestOrigin(request);
  if (!configured.has(origin) && origin !== sameOrigin) {
    throw new ApiError(403, 'ORIGIN_REJECTED', '请求来源不在允许列表中');
  }

  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') {
    throw new ApiError(403, 'CROSS_SITE_REJECTED', '拒绝跨站写操作');
  }
}

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });
  await app.register(helmet, {
    global: true,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    strictTransportSecurity:
      app.appConfig.env === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  });
  await app.register(rateLimit, {
    global: false,
    max: app.appConfig.loginRateLimitMax,
    timeWindow: app.appConfig.loginRateLimitWindow,
    errorResponseBuilder: (_request, context) => ({
      code: 'RATE_LIMITED',
      data: {
        after: context.after,
        max: context.max,
      },
      message: '登录尝试过于频繁，请稍后重试',
    }),
  });

  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request) => {
    validateOrigin(app, request);
    if (!request.url.startsWith('/api/')) return;
    const token = readSessionToken(request, app.appConfig);
    request.principal = token ? loadPrincipal(app.db, token) : null;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/auth/') || request.url.startsWith('/api/admin/')) {
      reply.header('Cache-Control', 'no-store');
      reply.header('Pragma', 'no-cache');
    }
    return payload;
  });
}
