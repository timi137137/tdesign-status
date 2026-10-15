import type { JsonValue, ServiceStatus } from '../../domain';

/** 探针参数字段的类型；同一份描述既驱动校验，也驱动后台表单。 */
export type ProbeFieldKind = 'string' | 'integer' | 'boolean' | 'string-list';

export interface ProbeConfigField {
  /** 参数对象里的键名。 */
  key: string;
  /** 后台表单上的字段名。 */
  label: string;
  kind: ProbeFieldKind;
  /** 缺省值；与 `required` 二选一。 */
  default?: JsonValue;
  required?: boolean;
  /** `integer` 的取值范围。 */
  minimum?: number;
  maximum?: number;
  /** `string` 允许的取值。 */
  options?: readonly string[];
  /** `string-list` 的最大项数。 */
  maximumItems?: number;
  description?: string;
}

export interface ProbeRunInput {
  /** 已由探针类型归一化的目标：URL 或 host:port。 */
  target: string;
  /** 点位参数原文，由探针类型自己校验。 */
  config: unknown;
  /** 超时与关闭由调度器控制，探针只需在 abort 时尽快返回。 */
  signal: AbortSignal;
}

export interface ProbeResult {
  status: ServiceStatus;
  latencyMs: number;
  detail?: string;
}

export interface ProbeType {
  /** 注册名，与 `service_probes.type` 对应。 */
  readonly name: string;
  readonly label: string;
  readonly fields: readonly ProbeConfigField[];
  /** 校验并归一化 target，不合法时抛 `ProbeConfigError`。 */
  normalizeTarget: (target: string) => string;
  /** 校验参数、套用默认值并做跨字段检查，返回可入库的参数对象。 */
  parseConfig: (raw: unknown) => Record<string, JsonValue>;
  run: (input: ProbeRunInput) => Promise<ProbeResult>;
}

/** 点位配置或 target 不合法；调用方负责映射成 400。 */
export class ProbeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProbeConfigError';
  }
}

/** 探测被 abort 时的样本说明；调用方需先排除"进程正在关闭"的情况。 */
export const PROBE_ABORT_DETAIL = '请求超时';

export interface ProbeRegistry {
  /** 注册探针类型；同名重复注册属于编程错误。 */
  register: (type: ProbeType) => void;
  has: (name: string) => boolean;
  get: (name: string) => ProbeType;
  list: () => ProbeType[];
}

export function createProbeRegistry(): ProbeRegistry {
  const types = new Map<string, ProbeType>();
  return {
    register(type) {
      if (types.has(type.name)) throw new Error(`探针类型 ${type.name} 已注册`);
      types.set(type.name, type);
    },
    has(name) {
      return types.has(name);
    },
    get(name) {
      const type = types.get(name);
      if (!type) throw new ProbeConfigError(`未知的探针类型：${name}`);
      return type;
    },
    list() {
      return [...types.values()];
    },
  };
}

/** 把探测异常压成一行可读说明，写入样本并在后台展示。 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const message = cause instanceof Error && cause.message ? `${error.message}：${cause.message}` : error.message;
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
