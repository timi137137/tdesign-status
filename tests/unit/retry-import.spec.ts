import { describe, expect, it, vi } from 'vitest';

import { retryImport } from '@/utils/retry-import';

describe('retryImport', () => {
  it('首次失败后会重试并在后续成功', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: { name: 'Ok' } });

    const result = await retryImport(loader, 2, 1)();
    expect(result).toEqual({ default: { name: 'Ok' } });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
