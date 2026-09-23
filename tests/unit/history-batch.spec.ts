import { describe, expect, it } from 'vitest';

import { expandHistoryBatchEnd } from '@/pages/public-status/history-batch';

const at = (day: number, hour = 12) => new Date(2026, 7, day, hour).getTime();

describe('expandHistoryBatchEnd', () => {
  const feed = [{ at: at(20) }, { at: at(20, 10) }, { at: at(19) }, { at: at(19, 9) }, { at: at(18) }];

  it('补齐截断当天', () => {
    expect(expandHistoryBatchEnd(feed, 1)).toBe(2);
    expect(expandHistoryBatchEnd(feed, 3)).toBe(4);
  });

  it('处理边界数量', () => {
    expect(expandHistoryBatchEnd(feed, 0)).toBe(0);
    expect(expandHistoryBatchEnd(feed, 99)).toBe(feed.length);
  });
});
