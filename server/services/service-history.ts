import { and, asc, eq, gt, gte, isNull, lt, lte, sql } from 'drizzle-orm';

import { DAILY_HEARTBEAT_BUCKET_MS, HEARTBEAT_BUCKET_MS, NO_DATA_HEARTBEAT } from '../../shared/public-contract';
import type { AppDatabase } from '../db/client';
import { entityServices, maintenances, serviceSamples, serviceStateEvents } from '../db/schema';
import type { ServiceStatus } from '../domain';
import { heartbeatValueForStatus, SERVICE_STATUS_SEVERITY } from '../domain';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** 通栏心跳条覆盖的格数：近 24 小时。 */
export const HEARTBEAT_BUCKETS = DAY_MS / HEARTBEAT_BUCKET_MS;

/** 双列半宽心跳条与可用率的格数：近 60 日。 */
export const HISTORY_BUCKETS = 60;
export const HISTORY_WINDOW_MS = HISTORY_BUCKETS * DAILY_HEARTBEAT_BUCKET_MS;

/** 没有数据的格子；公开页渲染成灰，不能画成正常。 */
export const NO_DATA = NO_DATA_HEARTBEAT;

/** 心跳值 → 严重度，用于把一段时间压成一格。 */
const SEVERITY_BY_HEARTBEAT: Record<number, number> = { 0: 3, 1: 0, 2: 1, 3: 2 };
/** 严重度 → 心跳值，与 `SEVERITY_BY_HEARTBEAT` 互为逆映射。 */
const HEARTBEAT_BY_SEVERITY = [1, 2, 3, 0];

const SAMPLE_SEVERITY = sql`case ${serviceSamples.heartbeatValue} ${sql.join(
  Object.entries(SEVERITY_BY_HEARTBEAT).map(([heartbeat, severity]) => sql`when ${Number(heartbeat)} then ${severity}`),
  sql` `,
)} end`;

/** 全部是"无数据"的格子；`Array.from({ length })` 会退化成 unknown[]，所以显式建数组。 */
function noDataBuckets(length: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < length; index += 1) values.push(NO_DATA);
  return values;
}

export interface ServiceHistory {
  /** 近 24 小时，一格 15 分钟。 */
  heartbeats: number[];
  /** 近 60 日，一格一天。 */
  dailyHeartbeats: number[];
  /** 近 60 日可用率；没有任何区间记录时为 null，由调用方决定用什么值。 */
  uptime: number | null;
}

interface StateEvent {
  at: number;
  toStatus: ServiceStatus;
}

interface MaintenanceWindow {
  start: number;
  end: number;
}

/**
 * 长历史不靠逐 interval 存储：当前状态由 `services` 行给出，近 24 小时读原始样本，
 * 近 30/60 日读"只在状态变化时写"的区间记录并叠加已发布维护窗口。
 */
export function buildServiceHistory(
  db: AppDatabase,
  serviceIds: string[],
  now = Date.now(),
): Map<string, ServiceHistory> {
  const history = new Map<string, ServiceHistory>(
    serviceIds.map((serviceId) => [
      serviceId,
      {
        heartbeats: noDataBuckets(HEARTBEAT_BUCKETS),
        dailyHeartbeats: noDataBuckets(HISTORY_BUCKETS),
        uptime: null,
      },
    ]),
  );
  const heartbeatWindowStart = now - HEARTBEAT_BUCKET_MS * HEARTBEAT_BUCKETS;
  const historyWindowStart = now - HISTORY_WINDOW_MS;

  fillHeartbeats(db, history, heartbeatWindowStart, now);
  fillDailyHistory(db, history, historyWindowStart, now);
  return history;
}

function fillHeartbeats(
  db: AppDatabase,
  history: Map<string, ServiceHistory>,
  windowStart: number,
  windowEnd: number,
): void {
  // 从窗口末端往回收桶，越界自动夹到第 0 格，样本再密也只回 96 行/服务。
  const bucket = sql<number>`${HEARTBEAT_BUCKETS - 1} - min(${HEARTBEAT_BUCKETS - 1}, cast((${windowEnd} - ${serviceSamples.observedAt}) / ${HEARTBEAT_BUCKET_MS} as integer))`;
  const rows = db
    .select({
      serviceId: serviceSamples.serviceId,
      bucket,
      severity: sql<number>`max(${SAMPLE_SEVERITY})`,
    })
    .from(serviceSamples)
    .where(
      and(
        isNull(serviceSamples.deletedAt),
        gte(serviceSamples.observedAt, windowStart),
        lte(serviceSamples.observedAt, windowEnd),
      ),
    )
    .groupBy(serviceSamples.serviceId, bucket)
    .all();

  for (const row of rows) {
    const record = history.get(row.serviceId);
    if (!record) continue;
    record.heartbeats[row.bucket] = HEARTBEAT_BY_SEVERITY[row.severity];
  }
}

function fillDailyHistory(
  db: AppDatabase,
  history: Map<string, ServiceHistory>,
  windowStart: number,
  windowEnd: number,
): void {
  const events = db
    .select({
      serviceId: serviceStateEvents.serviceId,
      at: serviceStateEvents.at,
      toStatus: serviceStateEvents.toStatus,
    })
    .from(serviceStateEvents)
    .where(
      and(
        isNull(serviceStateEvents.deletedAt),
        isNull(serviceStateEvents.probeId),
        gte(serviceStateEvents.at, windowStart),
        lte(serviceStateEvents.at, windowEnd),
      ),
    )
    .orderBy(asc(serviceStateEvents.at))
    .all();

  // 窗口开始之前最后一次变迁决定窗口起点时的状态；不读它，窗口左侧会被误判成"无数据"。
  const baselines = db.all<{ serviceId: string; at: number; toStatus: ServiceStatus }>(sql`
    select service_id as serviceId, at, to_status as toStatus from (
      select service_id, at, to_status,
             row_number() over (partition by service_id order by at desc) as rank
      from ${serviceStateEvents}
      where ${isNull(serviceStateEvents.deletedAt)}
        and ${isNull(serviceStateEvents.probeId)}
        and ${lt(serviceStateEvents.at, windowStart)}
    ) where rank = 1
  `);

  const windows = db
    .select({
      serviceId: entityServices.serviceId,
      start: maintenances.scheduledStart,
      end: maintenances.scheduledEnd,
    })
    .from(maintenances)
    .innerJoin(
      entityServices,
      and(
        eq(entityServices.entityType, 'maintenance'),
        eq(entityServices.entityId, maintenances.id),
        isNull(entityServices.deletedAt),
      ),
    )
    .where(
      and(
        eq(maintenances.publishState, 'published'),
        isNull(maintenances.deletedAt),
        gt(maintenances.scheduledEnd, windowStart),
        lt(maintenances.scheduledStart, windowEnd),
      ),
    )
    .all();

  const eventsByService = groupBy(events, (event) => event.serviceId);
  const windowsByService = groupBy(windows, (window) => window.serviceId);
  const baselinesByService = new Map(baselines.map((baseline) => [baseline.serviceId, baseline]));

  for (const [serviceId, record] of history) {
    const baseline = baselinesByService.get(serviceId);
    const serviceEvents = baseline
      ? [baseline, ...(eventsByService.get(serviceId) ?? [])]
      : (eventsByService.get(serviceId) ?? []);
    const serviceWindows = windowsByService.get(serviceId) ?? [];
    record.dailyHeartbeats = bucketDaily(serviceEvents, serviceWindows, windowStart, windowEnd);
    record.uptime = computeUptime(serviceEvents, serviceWindows, windowStart, windowEnd);
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const values = grouped.get(key(item)) ?? [];
    values.push(item);
    grouped.set(key(item), values);
  }
  return grouped;
}

/** 每格取与该天有交叠的最坏状态；维护窗口优先，计划内停机不该画成故障。 */
function bucketDaily(
  events: StateEvent[],
  windows: MaintenanceWindow[],
  windowStart: number,
  windowEnd: number,
): number[] {
  const values = noDataBuckets(HISTORY_BUCKETS);
  let cursor = 0;
  let current: ServiceStatus | null = null;
  for (let index = 0; index < HISTORY_BUCKETS; index += 1) {
    const start = windowStart + index * DAILY_HEARTBEAT_BUCKET_MS;
    const end = Math.min(start + DAILY_HEARTBEAT_BUCKET_MS, windowEnd);
    while (cursor < events.length && events[cursor].at <= start) {
      current = events[cursor].toStatus;
      cursor += 1;
    }
    const states: ServiceStatus[] = current ? [current] : [];
    for (let next = cursor; next < events.length && events[next].at < end; next += 1) {
      states.push(events[next].toStatus);
    }
    if (states.length === 0) continue;
    if (windows.some((window) => window.start < end && window.end > start)) {
      values[index] = heartbeatValueForStatus('maintenance');
      continue;
    }
    values[index] = heartbeatValueForStatus(worstOf(states));
  }
  return values;
}

function worstOf(states: ServiceStatus[]): ServiceStatus {
  let worst: ServiceStatus = 'up';
  for (const state of states) {
    if (SERVICE_STATUS_SEVERITY[state] > SERVICE_STATUS_SEVERITY[worst]) worst = state;
  }
  return worst;
}

/** 可用率只算未计划的中断：分母扣掉已发布维护窗口，没有区间记录时返回 null。 */
function computeUptime(
  events: StateEvent[],
  windows: MaintenanceWindow[],
  windowStart: number,
  windowEnd: number,
): number | null {
  const firstAt = events[0]?.at;
  if (firstAt === undefined) return null;
  const from = Math.max(windowStart, firstAt);
  if (windowEnd <= from) return 100;

  const planned = mergeWindows(windows, from, windowEnd);
  const plannedMs = planned.reduce((total, interval) => total + (interval.end - interval.start), 0);

  let downMs = 0;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].toStatus !== 'down') continue;
    const start = Math.max(events[index].at, from);
    const end = Math.min(events[index + 1]?.at ?? windowEnd, windowEnd);
    if (end <= start) continue;
    downMs += end - start - overlapMs(planned, start, end);
  }

  const availableMs = windowEnd - from - plannedMs;
  if (availableMs <= 0) return 100;
  return Math.min(100, Math.max(0, 100 * (1 - downMs / availableMs)));
}

function mergeWindows(windows: MaintenanceWindow[], from: number, to: number): MaintenanceWindow[] {
  const clipped = windows
    .map((window) => ({ start: Math.max(window.start, from), end: Math.min(window.end, to) }))
    .filter((window) => window.end > window.start)
    .sort((left, right) => left.start - right.start);
  const merged: MaintenanceWindow[] = [];
  for (const window of clipped) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}

function overlapMs(intervals: MaintenanceWindow[], start: number, end: number): number {
  let total = 0;
  for (const interval of intervals) {
    if (interval.end <= start) continue;
    if (interval.start >= end) break;
    total += Math.min(end, interval.end) - Math.max(start, interval.start);
  }
  return total;
}
