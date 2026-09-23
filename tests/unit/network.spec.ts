import { describe, expect, it } from 'vitest';

import { detectOffline } from '@/utils/network';

describe('detectOffline', () => {
  it('navigator.offLine 时直接视为离线，不发探测', async () => {
    let called = false;
    const offline = await detectOffline(async () => {
      called = true;
      return new Response('ok', { status: 200 });
    }, false);
    expect(offline).toBe(true);
    expect(called).toBe(false);
  });

  it('健康检查失败或抛错时视为离线', async () => {
    await expect(detectOffline(async () => new Response('', { status: 503 }), true)).resolves.toBe(true);
    await expect(
      detectOffline(async () => {
        throw new TypeError('Failed to fetch');
      }, true),
    ).resolves.toBe(true);
  });

  it('健康检查成功时视为在线', async () => {
    await expect(detectOffline(async () => new Response('{"code":"OK"}', { status: 200 }), true)).resolves.toBe(false);
  });
});
