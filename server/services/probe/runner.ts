import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type { AppDatabase } from '../../db/client';
import type { ServiceProbeRow } from '../../db/schema';
import { serviceProbes, services, serviceSamples, serviceStateEvents } from '../../db/schema';
import type { ServiceStatus } from '../../domain';
import { heartbeatValueForStatus } from '../../domain';
import { STATE_EVENT_REASON } from '../state-events';
import type { ProbeRegistry } from './registry';
import { describeFailure } from './registry';

/** 服务级聚合的严重度排序，取最坏值。 */
const STATUS_RANK: Record<ServiceStatus, number> = {
  up: 0,
  maintenance: 1,
  degraded: 2,
  down: 3,
};

export interface ProbeRunResult {
  status: ServiceStatus;
  latencyMs: number;
  detail?: string;
}

/**
 * 跑一次检查。点位配置错误、类型缺失、探测失败都归为异常结果，
 * 让后台与心跳条看得到问题，而不是只留在日志里。
 */
export async function executeProbe(
  registry: ProbeRegistry,
  probe: ServiceProbeRow,
  signal: AbortSignal,
): Promise<ProbeRunResult> {
  const startedAt = performance.now();
  try {
    const type = registry.get(probe.type);
    return await type.run({ target: type.normalizeTarget(probe.target), config: probe.configJson, signal });
  } catch (error) {
    return { status: 'down', latencyMs: Math.round(performance.now() - startedAt), detail: describeFailure(error) };
  }
}

/** 写入一次探测结果：样本、点位最近结果、状态变迁，最后刷新服务级聚合。 */
export function persistProbeResult(db: AppDatabase, probe: ServiceProbeRow, result: ProbeRunResult, now: number): void {
  const firstObservation = probe.lastStatus === null;
  const transitioned = !firstObservation && probe.lastStatus !== result.status;

  db.transaction((tx) => {
    tx.insert(serviceSamples)
      .values({
        id: randomUUID(),
        serviceId: probe.serviceId,
        probeId: probe.id,
        observedAt: now,
        status: result.status,
        heartbeatValue: heartbeatValueForStatus(result.status),
        latencyMs: result.latencyMs,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.update(serviceProbes)
      .set({
        lastCheckedAt: now,
        lastStatus: result.status,
        lastLatencyMs: result.latencyMs,
        // 只有确认不可达才累加；降级说明探测本身是通的。
        consecutiveFailures: result.status === 'down' ? probe.consecutiveFailures + 1 : 0,
        updatedAt: now,
        version: sql`${serviceProbes.version} + 1`,
      })
      .where(eq(serviceProbes.id, probe.id))
      .run();

    if (firstObservation || transitioned) {
      tx.insert(serviceStateEvents)
        .values({
          id: randomUUID(),
          serviceId: probe.serviceId,
          probeId: probe.id,
          at: now,
          // 首次观测没有前态，写成自变迁，作为区间记录的起点。
          fromStatus: probe.lastStatus ?? result.status,
          toStatus: result.status,
          reason: firstObservation ? STATE_EVENT_REASON.observationStarted : (result.detail ?? null),
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });

  refreshServiceStatus(db, probe.serviceId, now);
}

/**
 * 服务级状态 = 启用点位结果的最坏值。没有点位上报过结果时保持原样，
 * 人工设为维护的服务也不参与，否则探针会把人工声明直接抹掉。
 */
export function refreshServiceStatus(db: AppDatabase, serviceId: string, now: number): void {
  const service = db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), isNull(services.deletedAt)))
    .get();
  if (!service || service.status === 'maintenance') return;

  const reporting = db
    .select()
    .from(serviceProbes)
    .where(
      and(eq(serviceProbes.serviceId, serviceId), eq(serviceProbes.enabled, true), isNull(serviceProbes.deletedAt)),
    )
    .all()
    .filter((probe): probe is ServiceProbeRow & { lastStatus: ServiceStatus } => probe.lastStatus !== null);
  if (reporting.length === 0) return;

  let worst: ServiceStatus = 'up';
  for (const probe of reporting) {
    if (STATUS_RANK[probe.lastStatus] > STATUS_RANK[worst]) worst = probe.lastStatus;
  }
  const latencyMs = Math.max(...reporting.map((probe) => probe.lastLatencyMs ?? 0));

  const previous = db
    .select({ toStatus: serviceStateEvents.toStatus })
    .from(serviceStateEvents)
    .where(
      and(
        eq(serviceStateEvents.serviceId, serviceId),
        isNull(serviceStateEvents.probeId),
        isNull(serviceStateEvents.deletedAt),
      ),
    )
    .orderBy(desc(serviceStateEvents.at))
    .limit(1)
    .get();

  if (previous?.toStatus === worst) {
    db.update(services).set({ latencyMs, lastCheckAt: now, updatedAt: now }).where(eq(services.id, serviceId)).run();
    return;
  }

  db.transaction((tx) => {
    tx.insert(serviceStateEvents)
      .values({
        id: randomUUID(),
        serviceId,
        probeId: null,
        at: now,
        // 首次聚合以当前对外状态为起点，这样公开页看到的变化与记录一致。
        fromStatus: previous?.toStatus ?? service.status,
        toStatus: worst,
        reason: previous ? STATE_EVENT_REASON.probeAggregate : STATE_EVENT_REASON.observationStarted,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.update(services)
      .set({
        status: worst,
        latencyMs,
        lastCheckAt: now,
        updatedAt: now,
        version: sql`${services.version} + 1`,
      })
      .where(eq(services.id, serviceId))
      .run();
  });
}
