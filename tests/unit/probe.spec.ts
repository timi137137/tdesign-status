import { afterEach, describe, expect, it } from 'vitest';

import { createBuiltinProbeRegistry } from '../../server/services/probe';
import { parseProbeConfig } from '../../server/services/probe/config';
import { createProbeRegistry, ProbeConfigError } from '../../server/services/probe/registry';
import { httpProbe } from '../../server/services/probe/types/http';
import { tcpProbe } from '../../server/services/probe/types/tcp';
import { closeFixtures, idleSignal, startHttpServer, startTcpServer } from './probe-fixtures';

afterEach(async () => {
  await closeFixtures();
});

describe('探针注册表', () => {
  it('预装 http 与 tcp 两个类型', () => {
    expect(
      createBuiltinProbeRegistry()
        .list()
        .map((type) => type.name),
    ).toEqual(['http', 'tcp']);
  });

  it('未知类型报错', () => {
    expect(() => createProbeRegistry().get('nope')).toThrow(ProbeConfigError);
  });

  it('同名重复注册属于编程错误', () => {
    const registry = createProbeRegistry();
    registry.register(httpProbe);
    expect(() => registry.register(httpProbe)).toThrow(/已注册/);
  });
});

describe('探针参数校验', () => {
  it('缺省参数补齐默认值', () => {
    expect(parseProbeConfig(httpProbe.fields, undefined)).toEqual({
      method: 'GET',
      expectedStatusFrom: 200,
      expectedStatusTo: 399,
      followRedirects: true,
      degradedAboveMs: 0,
    });
  });

  it('null 视为缺省', () => {
    expect(parseProbeConfig(httpProbe.fields, { method: null }).method).toBe('GET');
  });

  it('拒绝未知字段而不是静默忽略', () => {
    expect(() => parseProbeConfig(httpProbe.fields, { methodd: 'GET' })).toThrow(/未知字段/);
  });

  it('拒绝越界整数与枚举外的取值', () => {
    expect(() => parseProbeConfig(httpProbe.fields, { degradedAboveMs: -1 })).toThrow(/不能小于/);
    expect(() => parseProbeConfig(httpProbe.fields, { method: 'DELETE' })).toThrow(/只能是/);
  });

  it('拒绝非对象参数', () => {
    expect(() => parseProbeConfig(httpProbe.fields, [])).toThrow(/JSON 对象/);
  });
});

describe('hTTP 探针', () => {
  it('归一化 target 并拒绝非 http(s)', () => {
    expect(httpProbe.normalizeTarget('https://example.com')).toBe('https://example.com/');
    expect(() => httpProbe.normalizeTarget('example.com')).toThrow(ProbeConfigError);
    expect(() => httpProbe.normalizeTarget('ftp://example.com')).toThrow(/http/);
  });

  it('状态码在区间内为正常', async () => {
    const target = await startHttpServer((_request, response) => {
      response.end('ok');
    });
    const result = await httpProbe.run({ target, config: {}, signal: idleSignal() });
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('状态码超出区间为异常并带上状态码', async () => {
    const target = await startHttpServer((_request, response) => {
      response.statusCode = 500;
      response.end();
    });
    const result = await httpProbe.run({ target, config: {}, signal: idleSignal() });
    expect(result.status).toBe('down');
    expect(result.detail).toBe('HTTP 500');
  });

  it('超过降级阈值记为降级', async () => {
    const target = await startHttpServer((_request, response) => {
      setTimeout(() => response.end('ok'), 50);
    });
    const result = await httpProbe.run({ target, config: { degradedAboveMs: 1 }, signal: idleSignal() });
    expect(result.status).toBe('degraded');
  });

  it('超时记为异常', async () => {
    const target = await startHttpServer((_request, response) => {
      setTimeout(() => {
        if (!response.destroyed) response.end('ok');
      }, 500);
    });
    const result = await httpProbe.run({ target, config: {}, signal: AbortSignal.timeout(50) });
    expect(result.status).toBe('down');
    expect(result.detail).toBe('请求超时');
  });

  it('跟随重定向后按最终状态码判定', async () => {
    const target = await startHttpServer((request, response) => {
      if (request.url === '/redirect') {
        response.statusCode = 302;
        response.setHeader('location', '/fail');
        response.end();
        return;
      }
      response.statusCode = 500;
      response.end();
    });
    const followed = await httpProbe.run({ target: `${target}/redirect`, config: {}, signal: idleSignal() });
    expect(followed.detail).toBe('HTTP 500');
    const manual = await httpProbe.run({
      target: `${target}/redirect`,
      config: { followRedirects: false },
      signal: idleSignal(),
    });
    expect(manual.status).toBe('up');
  });

  it('跨字段矛盾的状态码区间直接报错', async () => {
    const target = await startHttpServer((_request, response) => {
      response.end('ok');
    });
    const config = { expectedStatusFrom: 500, expectedStatusTo: 200 };
    await expect(httpProbe.run({ target, config, signal: idleSignal() })).rejects.toThrow(/下限不能大于上限/);
  });
});

describe('tCP 探针', () => {
  it('归一化 target 并拒绝非法写法', () => {
    expect(tcpProbe.normalizeTarget('example.com:443')).toBe('example.com:443');
    expect(tcpProbe.normalizeTarget('[::1]:443')).toBe('[::1]:443');
    expect(() => tcpProbe.normalizeTarget('example.com')).toThrow(ProbeConfigError);
    expect(() => tcpProbe.normalizeTarget('example.com:0')).toThrow(/1-65535/);
    expect(() => tcpProbe.normalizeTarget('example.com:70000')).toThrow(/1-65535/);
  });

  it('端口可连接为正常', async () => {
    const target = await startTcpServer();
    const result = await tcpProbe.run({ target, config: {}, signal: idleSignal() });
    expect(result.status).toBe('up');
  });

  it('端口未监听为异常', async () => {
    const target = await startTcpServer();
    await closeFixtures();
    const result = await tcpProbe.run({ target, config: {}, signal: idleSignal() });
    expect(result.status).toBe('down');
    expect(result.detail).toBeTruthy();
  });
});
