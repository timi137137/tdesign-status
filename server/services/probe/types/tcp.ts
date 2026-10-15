import { connect } from 'node:net';

import { parseProbeConfig, probeInteger } from '../config';
import type { ProbeConfigField, ProbeResult, ProbeRunInput, ProbeType } from '../registry';
import { describeFailure, PROBE_ABORT_DETAIL, ProbeConfigError } from '../registry';

const FIELDS: readonly ProbeConfigField[] = [
  {
    key: 'degradedAboveMs',
    label: '连接耗时超过该值视为降级（0 表示不判定）',
    kind: 'integer',
    default: 0,
    minimum: 0,
    maximum: 600_000,
  },
];

/** `host:port`，IPv6 需写成 `[::1]:443`。 */
const TARGET_PATTERN = /^(\[[^\]]+\]|[^:\s]+):(\d{1,5})$/;

function matchTarget(target: string): RegExpExecArray {
  const match = TARGET_PATTERN.exec(target.trim());
  if (!match) throw new ProbeConfigError('TCP 探针的 target 必须是 host:port');
  return match;
}

function normalizeTarget(target: string): string {
  const match = matchTarget(target);
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new ProbeConfigError('TCP 探针的端口必须在 1-65535 之间');
  return `${match[1]}:${port}`;
}

function parseConfig(raw: unknown) {
  return parseProbeConfig(FIELDS, raw);
}

function connectOnce(host: string, port: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const onAbort = () => {
      socket.destroy();
      reject(new Error(PROBE_ABORT_DETAIL));
    };
    const finish = (error?: Error) => {
      signal.removeEventListener('abort', onAbort);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    socket.once('connect', () => finish());
    socket.once('error', (error) => finish(error));
  });
}

async function run({ target, config, signal }: ProbeRunInput): Promise<ProbeResult> {
  const values = parseConfig(config);
  const degradedAboveMs = probeInteger(values, 'degradedAboveMs');
  const match = matchTarget(target);
  const host = match[1].startsWith('[') ? match[1].slice(1, -1) : match[1];
  const port = Number(match[2]);

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  try {
    await connectOnce(host, port, signal);
    const latencyMs = elapsed();
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

export const tcpProbe: ProbeType = {
  name: 'tcp',
  label: 'TCP 端口连通性',
  fields: FIELDS,
  normalizeTarget,
  parseConfig,
  run,
};
