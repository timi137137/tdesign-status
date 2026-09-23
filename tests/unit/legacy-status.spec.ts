import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discardLegacyStatus, readLegacyStatusPreview } from '@/utils/legacy-status';

const memory = new Map<string, string>();

describe('legacy status persist preview', () => {
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => memory.get(key) ?? null,
          setItem: (key: string, value: string) => {
            memory.set(key, value);
          },
          removeItem: (key: string) => {
            memory.delete(key);
          },
        },
      },
    });
  });

  afterEach(() => {
    discardLegacyStatus();
    memory.clear();
  });

  it('读取 status-v6 并禁止把空对象当成可导入数据', () => {
    window.localStorage.setItem(
      'status-v6',
      JSON.stringify({
        services: [{ id: 'qq-music', name: 'QQ 音乐', status: 'up', enabled: true }],
        incidents: [{ id: 'inc-tx-001', title: '历史事件' }],
        maintenances: [],
      }),
    );
    const preview = readLegacyStatusPreview();
    expect(preview?.key).toBe('status-v6');
    expect(preview?.serviceCount).toBe(1);
    expect(preview?.incidentCount).toBe(1);
    expect(preview?.services[0].name).toBe('QQ 音乐');
  });
});
