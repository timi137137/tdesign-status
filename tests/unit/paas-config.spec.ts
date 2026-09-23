import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig PaaS 兼容', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.STATUS_PORT;
    delete process.env.RENDER;
    delete process.env.STATUS_TRUST_PROXY;
    delete process.env.STATUS_AUTO_SEED;
    delete process.env.NODE_ENV;
  });

  it('未设 STATUS_PORT 时回退到 PORT', async () => {
    process.env.STATUS_PORT = '';
    process.env.PORT = '4123';
    process.env.NODE_ENV = 'test';
    const { loadConfig } = await import('../../server/config');
    expect(loadConfig().port).toBe(4123);
  });

  it('检测到 RENDER 时默认 trustProxy 与 autoSeed', async () => {
    process.env.STATUS_PORT = '3000';
    process.env.RENDER = 'true';
    process.env.NODE_ENV = 'production';
    process.env.STATUS_TRUST_PROXY = '';
    process.env.STATUS_AUTO_SEED = '';
    const { loadConfig } = await import('../../server/config');
    const config = loadConfig();
    expect(config.trustProxy).toBe(true);
    expect(config.autoSeed).toBe(true);
  });
});
