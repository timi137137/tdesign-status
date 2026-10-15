import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig PaaS 兼容', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.STATUS_PORT;
    delete process.env.STATUS_HOST;
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

  it('检测到 RENDER 时优先使用平台 PORT，并纠正回环 HOST', async () => {
    process.env.STATUS_PORT = '3000';
    process.env.PORT = '10000';
    process.env.STATUS_HOST = '127.0.0.1';
    process.env.RENDER = 'true';
    process.env.NODE_ENV = 'production';
    process.env.STATUS_TRUST_PROXY = '';
    process.env.STATUS_AUTO_SEED = '';
    const { loadConfig } = await import('../../server/config');
    const config = loadConfig();
    expect(config.port).toBe(10000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.trustProxy).toBe(1);
    expect(config.autoSeed).toBe(true);
  });

  it('检测到 RENDER 时默认 trustProxy 与 autoSeed', async () => {
    process.env.PORT = '10000';
    process.env.RENDER = 'true';
    process.env.NODE_ENV = 'production';
    process.env.STATUS_TRUST_PROXY = '';
    process.env.STATUS_AUTO_SEED = '';
    const { loadConfig } = await import('../../server/config');
    const config = loadConfig();
    expect(config.trustProxy).toBe(1);
    expect(config.autoSeed).toBe(true);
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(10000);
  });
});

describe('loadConfig STATUS_TRUST_PROXY', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.STATUS_TRUST_PROXY;
    delete process.env.RENDER;
    delete process.env.NODE_ENV;
  });

  const load = async (value: string) => {
    process.env.STATUS_TRUST_PROXY = value;
    const { loadConfig } = await import('../../server/config');
    return loadConfig().trustProxy;
  };

  it('直连部署不信任 X-Forwarded-For', async () => {
    expect(await load('false')).toBe(false);
    expect(await load('0')).toBe(false);
    expect(await load('')).toBe(false);
  });

  it('true 只信任一跳，避免信任客户端可伪造的整个头', async () => {
    expect(await load('true')).toBe(1);
    expect(await load('1')).toBe(1);
  });

  it('接受显式跳数', async () => {
    expect(await load('2')).toBe(2);
  });

  it('接受可信代理地址与 CIDR 列表', async () => {
    expect(await load('127.0.0.1,10.0.0.0/8,::1')).toEqual(['127.0.0.1', '10.0.0.0/8', '::1']);
  });

  it('拒绝非法条目而不是把错误留给 Fastify', async () => {
    await expect(load('yes')).rejects.toThrow(/STATUS_TRUST_PROXY/);
    await expect(load('127.0.0.1/abc')).rejects.toThrow(/STATUS_TRUST_PROXY/);
  });
});
