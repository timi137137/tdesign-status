import { afterEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../server/db/client';
import { createBuiltinProbeRegistry } from '../../server/services/probe';
import { createProbeScheduler } from '../../server/services/probe/scheduler';
import {
  closeFixtures,
  insertProbe,
  insertService,
  openTestDatabase,
  readSamples,
  sleep,
  startHttpServer,
  waitFor,
} from './probe-fixtures';

afterEach(async () => {
  await closeFixtures();
});

const silentLog = { error: () => {} };

function schedulerFor(db: AppDatabase, tickMs: number) {
  let results = 0;
  const scheduler = createProbeScheduler({
    db,
    log: silentLog,
    onResults: () => {
      results += 1;
    },
    concurrency: 2,
    timeoutMs: 2000,
    tickMs,
    registry: createBuiltinProbeRegistry(),
  });
  return { scheduler, resultCount: () => results };
}

describe('探针调度器', () => {
  it('到期点位被自动执行并写入样本', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const target = await startHttpServer((_request, response) => {
      response.end('ok');
    });
    insertProbe(db, { id: 'p1', serviceId: 's1', target });

    const { scheduler, resultCount } = schedulerFor(db, 20);
    scheduler.start();
    await waitFor(() => readSamples(db).length > 0);
    await scheduler.stop();

    expect(readSamples(db)).toHaveLength(1);
    expect(resultCount()).toBe(1);
  });

  it('未到期的点位不执行', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const target = await startHttpServer((_request, response) => {
      response.end('ok');
    });
    insertProbe(db, { id: 'p1', serviceId: 's1', target, lastCheckedAt: Date.now(), intervalSeconds: 3600 });

    const { scheduler } = schedulerFor(db, 20);
    scheduler.start();
    await sleep(150);
    await scheduler.stop();

    expect(readSamples(db)).toHaveLength(0);
  });

  it('在途点位不会被下一轮重复执行', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const target = await startHttpServer((_request, response) => {
      setTimeout(() => {
        if (!response.destroyed) response.end('ok');
      }, 200);
    });
    insertProbe(db, { id: 'p1', serviceId: 's1', target });

    const { scheduler } = schedulerFor(db, 10);
    scheduler.start();
    await waitFor(() => readSamples(db).length > 0);
    await sleep(120);
    await scheduler.stop();

    expect(readSamples(db)).toHaveLength(1);
  });

  it('stop 中止在途探测且不写入样本', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const target = await startHttpServer((_request, response) => {
      setTimeout(() => {
        if (!response.destroyed) response.end('ok');
      }, 400);
    });
    insertProbe(db, { id: 'p1', serviceId: 's1', target });

    const { scheduler } = schedulerFor(db, 20);
    scheduler.start();
    await sleep(60);
    await scheduler.stop();

    expect(readSamples(db)).toHaveLength(0);
  });

  it('kick 立刻检查到期点位', async () => {
    const { db } = openTestDatabase();
    insertService(db, 's1');
    const target = await startHttpServer((_request, response) => {
      response.end('ok');
    });
    insertProbe(db, { id: 'p1', serviceId: 's1', target });

    const { scheduler } = schedulerFor(db, 60_000);
    scheduler.kick();
    await waitFor(() => readSamples(db).length > 0);
    await scheduler.stop();

    expect(readSamples(db)).toHaveLength(1);
  });
});
