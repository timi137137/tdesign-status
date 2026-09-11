import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

export function contentEtag(value: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('base64url');
  return `"sha256-${digest}"`;
}

function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const values = (Array.isArray(header) ? header : header.split(',')).map((item) => item.trim());
  return values.includes('*') || values.includes(etag) || values.includes(`W/${etag}`);
}

export function applyPublicCache(
  request: FastifyRequest,
  reply: FastifyReply,
  etag: string,
  lastModified: number,
  maxAgeSeconds: number,
): boolean {
  const lastModifiedDate = new Date(lastModified);
  reply.header('ETag', etag);
  reply.header('Last-Modified', lastModifiedDate.toUTCString());
  reply.header('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`);
  reply.header('Vary', 'Accept-Encoding');

  if (matchesEtag(request.headers['if-none-match'], etag)) {
    reply.code(304).send();
    return true;
  }

  if (!request.headers['if-none-match'] && request.headers['if-modified-since']) {
    const modifiedSince = Date.parse(request.headers['if-modified-since']);
    if (Number.isFinite(modifiedSince) && Math.floor(lastModified / 1000) <= Math.floor(modifiedSince / 1000)) {
      reply.code(304).send();
      return true;
    }
  }

  return false;
}
