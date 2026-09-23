import type { FastifyRequest } from 'fastify';

import type { JsonObject, JsonValue } from '../domain';
import { badRequest, preconditionRequired } from './api';

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return badRequest('请求体必须是 JSON 对象');
  }
  return value as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, key: string, maxLength = 500): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    return badRequest(`${key} 不能为空`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return badRequest(`${key} 长度不能超过 ${maxLength}`);
  }
  return normalized;
}

export function optionalString(body: Record<string, unknown>, key: string, maxLength = 5000): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return badRequest(`${key} 必须是字符串`);
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return badRequest(`${key} 长度不能超过 ${maxLength}`);
  }
  return normalized;
}

export function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== 'boolean') return badRequest(`${key} 必须是布尔值`);
  return value;
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') return badRequest(`${key} 必须是布尔值`);
  return value;
}

export function requiredInteger(
  body: Record<string, unknown>,
  key: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return badRequest(`${key} 必须是 ${minimum} 至 ${maximum} 之间的整数`);
  }
  return value as number;
}

export function optionalInteger(
  body: Record<string, unknown>,
  key: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number | undefined {
  if (body[key] === undefined || body[key] === null) return undefined;
  return requiredInteger(body, key, minimum, maximum);
}

export function requiredStringArray(body: Record<string, unknown>, key: string, maximumItems = 100): string[] {
  const value = body[key];
  if (!Array.isArray(value) || value.length > maximumItems) {
    return badRequest(`${key} 必须是最多 ${maximumItems} 项的数组`);
  }
  const normalized = value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      return badRequest(`${key} 中只能包含非空字符串`);
    }
    return item.trim();
  });
  return [...new Set(normalized)];
}

export function enumValue<T extends string>(body: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = body[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    return badRequest(`${key} 必须是：${values.join(', ')}`);
  }
  return value as T;
}

export function optionalEnumValue<T extends string>(
  body: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T | undefined {
  if (body[key] === undefined) return undefined;
  return enumValue(body, key, values);
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 20) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length <= 1000 && value.every((item) => isJsonValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= 1000 && entries.every(([, item]) => isJsonValue(item, depth + 1));
  }
  return false;
}

export function requiredJsonObject(body: Record<string, unknown>, key: string): JsonObject {
  const value = body[key];
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonValue(value)) {
    return badRequest(`${key} 必须是合法 JSON 对象`);
  }
  return value as JsonObject;
}

function parseVersion(value: unknown): number | undefined {
  if (Number.isSafeInteger(value) && (value as number) > 0) return value as number;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function expectedVersion(request: FastifyRequest, body?: Record<string, unknown>): number {
  const header = Array.isArray(request.headers['if-match'])
    ? request.headers['if-match'][0]
    : request.headers['if-match'];
  const parsed = parseVersion(header) ?? parseVersion(body?.version);
  if (!parsed) return preconditionRequired();
  return parsed;
}

export function versionEtag(version: number): string {
  return `"${version}"`;
}

export function pagination(query: unknown): { page: number; pageSize: number; offset: number } {
  const values = query && typeof query === 'object' && !Array.isArray(query) ? (query as Record<string, unknown>) : {};
  const rawPage = typeof values.page === 'string' ? Number(values.page) : values.page;
  const rawPageSize = typeof values.pageSize === 'string' ? Number(values.pageSize) : values.pageSize;
  const page = Number.isSafeInteger(rawPage) && (rawPage as number) > 0 ? (rawPage as number) : 1;
  const pageSize =
    Number.isSafeInteger(rawPageSize) && (rawPageSize as number) > 0 && (rawPageSize as number) <= 100
      ? (rawPageSize as number)
      : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const SECRET_KEYS = /password|token|secret|hash/i;

export function auditJson(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    if (isJsonValue(item)) result[key] = item;
  }
  return result;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!slug || slug.length > 80) return badRequest('slug 格式不正确');
  return slug;
}
