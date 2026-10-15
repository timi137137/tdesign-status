import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

function loadDotEnv(): void {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`环境变量必须是正整数，收到：${value}`);
  }
  return parsed;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = positiveInteger(value, fallback);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`环境变量必须是 ${minimum} 至 ${maximum} 之间的整数，收到：${value}`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function normalizeOrigin(value: string): string {
  const url = new URL(value.trim());
  return url.origin;
}

function isTrustedProxyEntry(value: string): boolean {
  const [address, prefix] = value.split('/');
  if (prefix !== undefined && !/^\d{1,3}$/.test(prefix)) return false;
  return isIP(address) !== 0;
}

/**
 * Resolves Fastify's `trustProxy`. A blanket `true` makes `request.ip` come from
 * `X-Forwarded-For`, which any client can forge, so `true` means "exactly one
 * trusted hop" and self-hosted setups can list their proxy addresses instead.
 */
function resolveTrustProxy(onManagedPlatform: boolean): boolean | number | string[] {
  const raw = process.env.STATUS_TRUST_PROXY?.trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') {
    // Managed platforms always sit behind their own edge proxy, which appends
    // the real client address; trusting that single hop is safe there.
    return onManagedPlatform ? 1 : false;
  }
  if (raw === '1' || raw.toLowerCase() === 'true') return 1;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = list.filter((item) => !isTrustedProxyEntry(item));
  if (invalid.length > 0) {
    throw new Error(`STATUS_TRUST_PROXY 只能包含 IP/CIDR 或跳数，收到：${invalid.join(', ')}`);
  }
  return list;
}

export interface ServerConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly migrationsPath: string;
  readonly distPath: string;
  readonly cookieName: string;
  readonly cookieSecure: boolean;
  readonly sessionTtlMs: number;
  readonly loginRateLimitMax: number;
  readonly loginRateLimitWindow: string;
  readonly publicCacheSeconds: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly trustProxy: boolean | number | string[];
  readonly bodyLimit: number;
  readonly autoSeed: boolean;
  readonly probesEnabled: boolean;
  readonly probeTimeoutMs: number;
  readonly probeConcurrency: number;
}

function detectsManagedPlatform(): boolean {
  return Boolean(
    process.env.RENDER ||
    process.env.KOYEB_APP_ID ||
    process.env.KOYEB_SERVICE_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.FLY_APP_NAME,
  );
}

function resolveListenHost(onManagedPlatform: boolean): string {
  const configured = process.env.STATUS_HOST?.trim();
  if (onManagedPlatform) {
    if (!configured || configured === '127.0.0.1' || configured === 'localhost') {
      return '0.0.0.0';
    }
    return configured;
  }
  return configured || '0.0.0.0';
}

function resolveListenPort(onManagedPlatform: boolean): number {
  if (onManagedPlatform && process.env.PORT) {
    return positiveInteger(process.env.PORT, 10000);
  }
  return positiveInteger(process.env.STATUS_PORT || process.env.PORT, 3000);
}

export function loadConfig(): ServerConfig {
  loadDotEnv();
  const rawEnv = process.env.NODE_ENV;
  const env: ServerConfig['env'] = rawEnv === 'production' || rawEnv === 'test' ? rawEnv : 'development';
  const root = process.cwd();
  const sessionHours = positiveInteger(process.env.STATUS_SESSION_HOURS, 12);
  const allowedOrigins = new Set(
    (process.env.STATUS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizeOrigin),
  );
  if (env === 'development' && allowedOrigins.size === 0) {
    allowedOrigins.add('http://127.0.0.1:3002');
    allowedOrigins.add('http://localhost:3002');
    allowedOrigins.add('http://127.0.0.1:3003');
    allowedOrigins.add('http://localhost:3003');
  }

  const onManagedPlatform = detectsManagedPlatform();

  return {
    env,
    host: resolveListenHost(onManagedPlatform),
    port: resolveListenPort(onManagedPlatform),
    databasePath: path.resolve(root, process.env.STATUS_DB_PATH || './server/data/status.db'),
    migrationsPath: path.resolve(root, './server/db/migrations'),
    distPath: path.resolve(root, process.env.STATUS_DIST_PATH || './dist'),
    cookieName: process.env.STATUS_COOKIE_NAME || 'status_session',
    cookieSecure: env === 'production' || booleanValue(process.env.STATUS_COOKIE_SECURE, false),
    sessionTtlMs: sessionHours * 60 * 60 * 1000,
    loginRateLimitMax: positiveInteger(process.env.STATUS_LOGIN_RATE_LIMIT, 5),
    loginRateLimitWindow: process.env.STATUS_LOGIN_RATE_WINDOW || '1 minute',
    publicCacheSeconds: positiveInteger(process.env.STATUS_PUBLIC_CACHE_SECONDS, 30),
    allowedOrigins,
    trustProxy: resolveTrustProxy(onManagedPlatform),
    bodyLimit: positiveInteger(process.env.STATUS_BODY_LIMIT, 1024 * 1024),
    autoSeed: booleanValue(process.env.STATUS_AUTO_SEED, onManagedPlatform),
    probesEnabled: booleanValue(process.env.STATUS_PROBES_ENABLED, false),
    probeTimeoutMs: boundedInteger(process.env.STATUS_PROBE_TIMEOUT_MS, 5000, 100, 60_000),
    probeConcurrency: boundedInteger(process.env.STATUS_PROBE_CONCURRENCY, 4, 1, 64),
  };
}
