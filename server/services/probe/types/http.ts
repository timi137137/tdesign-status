import type { ProbeConfigValues } from '../config';
import { parseProbeConfig, probeBoolean, probeInteger, probeString } from '../config';
import type { ProbeConfigField, ProbeResult, ProbeRunInput, ProbeType } from '../registry';
import { describeFailure, PROBE_ABORT_DETAIL, ProbeConfigError } from '../registry';

const USER_AGENT = 'tdesign-status-probe';

const FIELDS: readonly ProbeConfigField[] = [
  {
    key: 'method',
    label: '请求方法',
    kind: 'string',
    options: ['GET', 'HEAD', 'POST'],
    default: 'GET',
  },
  {
    key: 'expectedStatusFrom',
    label: '接受的状态码下限',
    kind: 'integer',
    default: 200,
    minimum: 100,
    maximum: 599,
  },
  {
    key: 'expectedStatusTo',
    label: '接受的状态码上限',
    kind: 'integer',
    default: 399,
    minimum: 100,
    maximum: 599,
  },
  {
    key: 'followRedirects',
    label: '跟随重定向',
    kind: 'boolean',
    default: true,
  },
  {
    key: 'degradedAboveMs',
    label: '响应耗时超过该值视为降级（0 表示不判定）',
    kind: 'integer',
    default: 0,
    minimum: 0,
    maximum: 600_000,
  },
];

function normalizeTarget(target: string): string {
  let url: URL;
  try {
    url = new URL(target.trim());
  } catch {
    throw new ProbeConfigError('HTTP 探针的 target 必须是绝对 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProbeConfigError('HTTP 探针只支持 http 与 https');
  }
  return url.toString();
}

function parseConfig(raw: unknown): ProbeConfigValues {
  const values = parseProbeConfig(FIELDS, raw);
  if (probeInteger(values, 'expectedStatusFrom') > probeInteger(values, 'expectedStatusTo')) {
    throw new ProbeConfigError('接受的状态码下限不能大于上限');
  }
  return values;
}

async function run({ target, config, signal }: ProbeRunInput): Promise<ProbeResult> {
  const values = parseConfig(config);
  const method = probeString(values, 'method');
  const statusFrom = probeInteger(values, 'expectedStatusFrom');
  const statusTo = probeInteger(values, 'expectedStatusTo');
  const followRedirects = probeBoolean(values, 'followRedirects');
  const degradedAboveMs = probeInteger(values, 'degradedAboveMs');

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  try {
    const response = await fetch(target, {
      method,
      redirect: followRedirects ? 'follow' : 'manual',
      headers: { 'user-agent': USER_AGENT },
      signal,
    });
    const latencyMs = elapsed();
    // 只关心状态码与耗时，不读取响应体。
    await response.body?.cancel();
    if (response.status < statusFrom || response.status > statusTo) {
      return { status: 'down', latencyMs, detail: `HTTP ${response.status}` };
    }
    if (degradedAboveMs > 0 && latencyMs > degradedAboveMs) {
      return { status: 'degraded', latencyMs, detail: `耗时 ${latencyMs}ms 超过 ${degradedAboveMs}ms` };
    }
    return { status: 'up', latencyMs };
  } catch (error) {
    const latencyMs = elapsed();
    if (signal.aborted) return { status: 'down', latencyMs, detail: PROBE_ABORT_DETAIL };
    return { status: 'down', latencyMs, detail: describeFailure(error) };
  }
}

export const httpProbe: ProbeType = {
  name: 'http',
  label: 'HTTP(S) 状态检查',
  fields: FIELDS,
  normalizeTarget,
  parseConfig,
  run,
};
