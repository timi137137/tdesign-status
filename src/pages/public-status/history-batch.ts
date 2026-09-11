import dayjs from 'dayjs';

export const HISTORY_DAY_FORMAT = 'YYYY 年 M 月 D 日';

export function historyDayKey(at: number) {
  return dayjs(at).format(HISTORY_DAY_FORMAT);
}

/** 按条数截取；若截断点落在某天中间，则补齐该天剩余事件 */
export function expandHistoryBatchEnd<T extends { at: number }>(feed: T[], requestedCount: number): number {
  if (requestedCount <= 0) return 0;
  if (requestedCount >= feed.length) return feed.length;
  const boundaryDay = historyDayKey(feed[requestedCount - 1].at);
  let end = requestedCount;
  while (end < feed.length && historyDayKey(feed[end].at) === boundaryDay) {
    end += 1;
  }
  return end;
}
