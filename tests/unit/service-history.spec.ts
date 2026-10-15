import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../server/db/client';
import { entityServices, maintenances, serviceSamples, serviceStateEvents } from '../../server/db/schema';
import type { ServiceStatus } from '../../server/domain';
import { heartbeatValueForStatus } from '../../server/domain';
import { runRetentionSweep } from '../../server/services/retention';
import {
  buildServiceHistory,
  HEARTBEAT_BUCKETS,
  HISTORY_BUCKETS,
  NO_DATA,
} from '../../server/services/service-history';
import { buildSnapshot } from '../../server/services/snapshot';
import {
  closeFixtures,
  insertService,
  mustGet,
  openTestDatabase,
  readSamples,
  readStateEvents,
} from './probe-fixtures';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BUCKET_MS = 15 * MINUTE_MS;

/** 固定时间轴，避免用"现在"做断言。 */
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

afterEach(async () => {
  await closeFixtures();
});

function insertSample(db: AppDatabase, serviceId: string, observedAt: number, status: ServiceStatus): void {
  db.insert(serviceSamples)
    .values({
      id: randomUUID(),
      serviceId,
      observedAt,
      status,
      heartbeatValue: heartbeatValueForStatus(status),
      latencyMs: 10,
      createdAt: observedAt,
      updatedAt: observedAt,
    })
    .run();
}

function insertEvent(
  db: AppDatabase,
  serviceId: string,
  at: number,
  fromStatus: ServiceStatus,
  toStatus: ServiceStatus,
): void {
  db.insert(serviceStateEvents)
    .values({
      id: randomUUID(),
      serviceId,
      probeId: null,
      at,
      fromStatus,
      toStatus,
      reason: 'manual',
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function insertMaintenance(db: AppDatabase, serviceId: string, start: number, end: number): void {
  const id = randomUUID();
  db.insert(maintenances)
    .values({
      id,
      title: '计划维护',
      status: 'scheduled',
      scheduledStart: start,
      scheduledEnd: end,
      progress: 0,
      publishState: 'published',
      publishedAt: start,
      createdAt: start,
      updatedAt: start,
    })
    .run();
  db.insert(entityServices)
    .values({
      id: randomUUID(),
      entityType: 'maintenance',
      entityId: id,
      serviceId,
      createdAt: start,
      updatedAt: start,
    })
    .run();
}

function historyOf(db: AppDatabase, serviceId = 's1', now = NOW) {
  return mustGet(buildServiceHistory(db, [serviceId], now).get(serviceId), '历史记录');
}

describe('近 24 小时心跳条', () => {
  it('没有样本时整条都是无数据', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const history = historyOf(db);
    expect(history.heartbeats).toHaveLength(HEARTBEAT_BUCKETS);
    expect(history.heartbeats.every((value) => value === NO_DATA)).toBe(true);
  });

  it('按窗口末端切格，最近的样本落在最后一格', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertSample(db, 's1', NOW, 'up');
    insertSample(db, 's1', NOW - BUCKET_MS, 'up');
    insertSample(db, 's1', NOW - 2 * BUCKET_MS, 'up');
    const { heartbeats } = historyOf(db);
    expect(heartbeats[HEARTBEAT_BUCKETS - 1]).toBe(1);
    expect(heartbeats[HEARTBEAT_BUCKETS - 2]).toBe(1);
    expect(heartbeats[HEARTBEAT_BUCKETS - 3]).toBe(1);
    expect(heartbeats[HEARTBEAT_BUCKETS - 4]).toBe(NO_DATA);
  });

  it('同一格取最坏状态', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertSample(db, 's1', NOW - 5 * MINUTE_MS, 'up');
    insertSample(db, 's1', NOW - 3 * MINUTE_MS, 'degraded');
    insertSample(db, 's1', NOW - MINUTE_MS, 'up');
    expect(historyOf(db).heartbeats[HEARTBEAT_BUCKETS - 1]).toBe(3);

    insertSample(db, 's1', NOW - 2 * MINUTE_MS, 'down');
    expect(historyOf(db).heartbeats[HEARTBEAT_BUCKETS - 1]).toBe(0);
  });

  it('窗口外的样本不进条，边界样本夹到第一格', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertSample(db, 's1', NOW - 25 * HOUR_MS, 'down');
    insertSample(db, 's1', NOW - 24 * HOUR_MS, 'up');
    const { heartbeats } = historyOf(db);
    expect(heartbeats[0]).toBe(1);
    expect(heartbeats.filter((value) => value !== NO_DATA)).toHaveLength(1);
  });
});

describe('近 60 日状态条', () => {
  it('没有区间记录时整条都是无数据，可用率为空', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const history = historyOf(db);
    expect(history.dailyHeartbeats).toHaveLength(HISTORY_BUCKETS);
    expect(history.dailyHeartbeats.every((value) => value === NO_DATA)).toBe(true);
    expect(history.uptime).toBeNull();
  });

  it('起点写基线，之后只在状态变化时留下区间', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertEvent(db, 's1', NOW - 30 * DAY_MS, 'up', 'down');
    insertEvent(db, 's1', NOW - 29 * DAY_MS, 'down', 'up');
    const { dailyHeartbeats } = historyOf(db);

    expect(dailyHeartbeats[0]).toBe(NO_DATA);
    expect(dailyHeartbeats[1]).toBe(1);
    expect(dailyHeartbeats[29]).toBe(1);
    expect(dailyHeartbeats[30]).toBe(0);
    expect(dailyHeartbeats[31]).toBe(1);
    expect(dailyHeartbeats[HISTORY_BUCKETS - 1]).toBe(1);
  });

  it('已发布维护窗口覆盖的那天画成维护，而不是故障', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertMaintenance(db, 's1', NOW - 10 * DAY_MS, NOW - 9 * DAY_MS);
    const { dailyHeartbeats } = historyOf(db);
    expect(dailyHeartbeats[50]).toBe(2);
    expect(dailyHeartbeats[49]).toBe(1);
  });

  it('未发布的维护不影响状态条', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertMaintenance(db, 's1', NOW - 10 * DAY_MS, NOW - 9 * DAY_MS);
    db.update(maintenances).set({ publishState: 'draft' }).run();
    expect(historyOf(db).dailyHeartbeats[50]).toBe(1);
  });

  it('窗口开始前的最后一次变迁决定左侧起点状态', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 100 * DAY_MS, 'up', 'down');
    insertEvent(db, 's1', NOW - 90 * DAY_MS, 'down', 'up');
    const history = historyOf(db);
    expect(history.dailyHeartbeats.every((value) => value === 1)).toBe(true);
    expect(history.uptime).toBe(100);
  });

  it('窗口开始前处于异常时，左侧格子跟着变红', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 100 * DAY_MS, 'up', 'down');
    const history = historyOf(db);
    expect(history.dailyHeartbeats.every((value) => value === 0)).toBe(true);
    expect(history.uptime).toBe(0);
  });
});

describe('可用率', () => {
  it('全时段正常为 100%', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    expect(historyOf(db).uptime).toBe(100);
  });

  it('按区间算中断时长', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertEvent(db, 's1', NOW - 30 * DAY_MS, 'up', 'down');
    insertEvent(db, 's1', NOW - 29 * DAY_MS, 'down', 'up');
    // 59 天里有 1 天中断。
    expect(historyOf(db).uptime).toBeCloseTo(100 * (1 - 1 / 59), 6);
  });

  it('维护窗口从中扣除，窗口内的中断不算在分母里', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertEvent(db, 's1', NOW - 30 * DAY_MS, 'up', 'down');
    insertEvent(db, 's1', NOW - 29 * DAY_MS, 'down', 'up');
    insertMaintenance(db, 's1', NOW - 10 * DAY_MS, NOW - 8 * DAY_MS);
    expect(historyOf(db).uptime).toBeCloseTo(100 * (1 - 1 / 57), 6);
  });

  it('维护窗口内的中断不计入中断时长', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertEvent(db, 's1', NOW - 59 * DAY_MS, 'up', 'up');
    insertEvent(db, 's1', NOW - 30 * DAY_MS, 'up', 'down');
    insertEvent(db, 's1', NOW - 29 * DAY_MS, 'down', 'up');
    // 窗口完全包住那 1 天中断：中断时长归零。
    insertMaintenance(db, 's1', NOW - 30.5 * DAY_MS, NOW - 28.5 * DAY_MS);
    expect(historyOf(db).uptime).toBe(100);
  });
});

describe('保留策略', () => {
  it('原始样本按天清理，状态区间保留更久', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const now = Date.now();
    insertSample(db, 's1', now - 3 * DAY_MS, 'up');
    insertSample(db, 's1', now - DAY_MS, 'up');
    insertEvent(db, 's1', now - 100 * DAY_MS, 'up', 'up');
    insertEvent(db, 's1', now - 500 * DAY_MS, 'up', 'up');

    const result = runRetentionSweep(db, now);

    expect(result.serviceSamples).toBe(1);
    expect(result.serviceStateEvents).toBe(1);
    expect(readSamples(db)).toHaveLength(1);
    expect(readStateEvents(db)).toHaveLength(1);
  });
});

describe('公开快照', () => {
  it('心跳条按固定格数输出，可用率来自区间记录', () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const now = Date.now();
    insertSample(db, 's1', now - HOUR_MS, 'up');
    insertEvent(db, 's1', now - 10 * DAY_MS, 'up', 'up');

    const service = mustGet(buildSnapshot(db).services[0], '公开服务');
    expect(service.heartbeats).toHaveLength(HEARTBEAT_BUCKETS);
    expect(service.dailyHeartbeats).toHaveLength(HISTORY_BUCKETS);
    expect(service.uptime).toBe(100);
    expect(service).not.toHaveProperty('latencyHistory');
  });
});
