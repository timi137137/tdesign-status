import { and, eq, isNull } from 'drizzle-orm';

import type { AppDatabase } from '../../db/client';
import type { ServiceProbeRow } from '../../db/schema';
import { serviceProbes } from '../../db/schema';
import { createBuiltinProbeRegistry } from './index';
import type { ProbeRegistry } from './registry';
import { executeProbe, persistProbeResult } from './runner';

const DEFAULT_TICK_MS = 5_000;

export interface ProbeSchedulerLogger {
  error: (context: unknown, message: string) => void;
}

export interface ProbeSchedulerOptions {
  db: AppDatabase;
  log: ProbeSchedulerLogger;
  /** 结果落库后调用，用于重建公开快照。 */
  onResults: () => void;
  /** 全局并发上限，避免一轮里同时打满所有点位。 */
  concurrency: number;
  timeoutMs: number;
  /** 到期检查的轮询间隔。 */
  tickMs?: number;
  registry?: ProbeRegistry;
}

export interface ProbeScheduler {
  start: () => void;
  /** 立刻检查到期点位，不等下一个轮询。 */
  kick: () => void;
  /** 停止轮询、中止在途探测，并等本轮收尾。 */
  stop: () => Promise<void>;
}

/**
 * 轮询到期点位并执行。用单一轮询而不是每点位一个定时器：点位增删改、间隔调整
 * 都不需要维护定时器集合，一轮内也不会重复执行同一个点位。
 */
export function createProbeScheduler(options: ProbeSchedulerOptions): ProbeScheduler {
  const registry = options.registry ?? createBuiltinProbeRegistry();
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const controller = new AbortController();
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let round: Promise<void> | null = null;

  const dueProbes = (now: number): ServiceProbeRow[] =>
    options.db
      .select()
      .from(serviceProbes)
      .where(and(eq(serviceProbes.enabled, true), isNull(serviceProbes.deletedAt)))
      .all()
      .filter(
        (probe) =>
          !inFlight.has(probe.id) &&
          (probe.lastCheckedAt === null || probe.lastCheckedAt + probe.intervalSeconds * 1000 <= now),
      );

  const runOne = async (probe: ServiceProbeRow): Promise<void> => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.timeoutMs)]);
    const result = await executeProbe(registry, probe, signal);
    // 关闭中：探测结果作废，不能写进库里。
    if (controller.signal.aborted) return;
    try {
      persistProbeResult(options.db, probe, result, Date.now());
      options.onResults();
    } catch (error) {
      options.log.error({ err: error, probeId: probe.id }, '探针结果落库失败');
    }
  };

  const runRound = async (): Promise<void> => {
    const queue = dueProbes(Date.now());
    const workers = Math.min(options.concurrency, queue.length);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          const probe = queue.shift();
          if (!probe || controller.signal.aborted) return;
          inFlight.add(probe.id);
          try {
            await runOne(probe);
          } finally {
            inFlight.delete(probe.id);
          }
        }
      }),
    );
  };

  const tick = (): void => {
    if (round || controller.signal.aborted) return;
    round = runRound().finally(() => {
      round = null;
    });
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, tickMs);
      timer.unref();
      tick();
    },
    kick() {
      tick();
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      controller.abort();
      await round;
    },
  };
}
