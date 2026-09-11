import type { FastifyReply } from 'fastify';

export interface ApiEnvelope<T> {
  code: string;
  data: T;
  message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;

  readonly code: string;

  readonly data: unknown;

  constructor(statusCode: number, code: string, message: string, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
  }
}

export function ok<T>(reply: FastifyReply, data: T, message = 'ok', statusCode = 200): FastifyReply {
  const body: ApiEnvelope<T> = {
    code: 'OK',
    data,
    message,
  };
  return reply.code(statusCode).send(body);
}

export function badRequest(message: string, data: unknown = null): never {
  throw new ApiError(400, 'BAD_REQUEST', message, data);
}

export function unauthorized(message = '未登录或会话已失效'): never {
  throw new ApiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = '当前角色无权执行此操作'): never {
  throw new ApiError(403, 'FORBIDDEN', message);
}

export function notFound(message = '资源不存在'): never {
  throw new ApiError(404, 'NOT_FOUND', message);
}

export function conflict(message = '资源版本已变化，请刷新后重试'): never {
  throw new ApiError(409, 'VERSION_CONFLICT', message);
}

export function preconditionRequired(message = '必须提供 If-Match 或 version'): never {
  throw new ApiError(428, 'PRECONDITION_REQUIRED', message);
}
