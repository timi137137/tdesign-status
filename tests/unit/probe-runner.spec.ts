import { afterEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../server/db/client';
import { createBuiltinProbeRegistry } from '../../server/services/probe';
import { executeProbe, persistProbeResult } from '../../server/services/probe/runner';
import {
  closeFixtures,
  idleSignal,
  insertProbe,
  insertService,
  mustGet,
  openTestDatabase,
  readProbe,
  readSamples,
  readService,
  readStateEvents,
} from './probe-fixtures';

afterEach(async () => {
  await closeFixtures();
});

function serviceEvents(db: AppDatabase) {
  return readStateEvents(db).filter((event) => event.probeId === null);
}

function probeEvents(db: AppDatabase, probeId: string) {
  return readStateEvents(db).filter((event) => event.probeId === probeId);
}

describe('探针执行', () => {
  it('点位配置不合法时归为异常结果而不是抛错', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'not-a-url' });

    const result = await executeProbe(createBuiltinProbeRegistry(), readProbe(db, 'p1'), idleSignal());
    expect(result.status).toBe('down');
    expect(result.detail).toContain('绝对 URL');
  });

  it('点位类型不存在时归为异常结果', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/', type: 'nope' });

    const result = await executeProbe(createBuiltinProbeRegistry(), readProbe(db, 'p1'), idleSignal());
    expect(result.status).toBe('down');
    expect(result.detail).toContain('未知的探针类型');
  });
});

describe('探针结果落库', () => {
  it('正常结果写样本、刷新点位与服务，并留下基线变迁', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });
    const now = Date.now();

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'up', latencyMs: 12 }, now);

    const sample = mustGet(readSamples(db)[0], '样本');
    expect(sample.probeId).toBe('p1');
    expect(sample.serviceId).toBe('s1');
    expect(sample.status).toBe('up');
    expect(sample.heartbeatValue).toBe(1);
    expect(sample.latencyMs).toBe(12);
    expect(sample.observedAt).toBe(now);

    const probe = readProbe(db, 'p1');
    expect(probe.lastStatus).toBe('up');
    expect(probe.lastLatencyMs).toBe(12);
    expect(probe.lastCheckedAt).toBe(now);
    expect(probe.consecutiveFailures).toBe(0);

    const service = readService(db, 's1');
    expect(service.status).toBe('up');
    expect(service.latencyMs).toBe(12);
    expect(service.lastCheckAt).toBe(now);

    const events = probeEvents(db, 'p1');
    expect(events).toHaveLength(1);
    expect(events[0].fromStatus).toBe('up');
    expect(events[0].toStatus).toBe('up');
    expect(events[0].reason).toBe('observation_started');

    const aggregate = serviceEvents(db);
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].fromStatus).toBe('up');
    expect(aggregate[0].toStatus).toBe('up');
    expect(aggregate[0].reason).toBe('observation_started');
  });

  it('首次观测就异常时，服务变迁从当前对外状态写起', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'down', latencyMs: 5000 }, Date.now());

    const aggregate = serviceEvents(db);
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].fromStatus).toBe('up');
    expect(aggregate[0].toStatus).toBe('down');
    expect(readService(db, 's1').status).toBe('down');
  });

  it('异常结果累加连续失败并写出变迁', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'up', latencyMs: 12 }, Date.now());
    persistProbeResult(db, readProbe(db, 'p1'), { status: 'down', latencyMs: 5000, detail: 'HTTP 500' }, Date.now());

    const probe = readProbe(db, 'p1');
    expect(probe.lastStatus).toBe('down');
    expect(probe.consecutiveFailures).toBe(1);

    expect(readService(db, 's1').status).toBe('down');

    const events = probeEvents(db, 'p1');
    expect(events).toHaveLength(2);
    expect(events[1].fromStatus).toBe('up');
    expect(events[1].toStatus).toBe('down');
    expect(events[1].reason).toBe('HTTP 500');

    const aggregate = serviceEvents(db);
    expect(aggregate).toHaveLength(2);
    expect(aggregate[1].fromStatus).toBe('up');
    expect(aggregate[1].toStatus).toBe('down');
    expect(aggregate[1].reason).toBe('probe_aggregate');
  });

  it('降级会清零连续失败，因为探测本身是通的', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'down', latencyMs: 5000 }, Date.now());
    persistProbeResult(db, readProbe(db, 'p1'), { status: 'degraded', latencyMs: 900 }, Date.now());

    expect(readProbe(db, 'p1').consecutiveFailures).toBe(0);
    expect(readService(db, 's1').status).toBe('degraded');
  });

  it('多点位取最坏值，恢复后回到正常', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });
    insertProbe(db, { id: 'p2', serviceId: 's1', target: 'http://127.0.0.1:2/' });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'up', latencyMs: 10 }, Date.now());
    expect(readService(db, 's1').status).toBe('up');

    persistProbeResult(db, readProbe(db, 'p2'), { status: 'down', latencyMs: 5000 }, Date.now());
    expect(readService(db, 's1').status).toBe('down');

    persistProbeResult(db, readProbe(db, 'p2'), { status: 'up', latencyMs: 20 }, Date.now());
    expect(readService(db, 's1').status).toBe('up');

    const aggregate = serviceEvents(db);
    expect(aggregate.map((event) => event.toStatus)).toEqual(['up', 'down', 'up']);
  });

  it('人工维护中的服务不被探针改写', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1', 'maintenance');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'down', latencyMs: 5000 }, Date.now());

    expect(readService(db, 's1').status).toBe('maintenance');
    expect(serviceEvents(db)).toHaveLength(0);
    expect(probeEvents(db, 'p1')).toHaveLength(1);
  });

  it('停用点位不参与服务级聚合', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/' });
    insertProbe(db, { id: 'p2', serviceId: 's1', target: 'http://127.0.0.1:2/', enabled: false });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'up', latencyMs: 10 }, Date.now());
    persistProbeResult(db, readProbe(db, 'p2'), { status: 'down', latencyMs: 5000 }, Date.now());

    expect(readService(db, 's1').status).toBe('up');
  });

  it('没有任何点位上报过结果时不动服务状态', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1', 'degraded');
    insertProbe(db, { id: 'p1', serviceId: 's1', target: 'http://127.0.0.1:1/', enabled: false });

    persistProbeResult(db, readProbe(db, 'p1'), { status: 'up', latencyMs: 10 }, Date.now());

    expect(readService(db, 's1').status).toBe('degraded');
    expect(serviceEvents(db)).toHaveLength(0);
  });
});
