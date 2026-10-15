import type { JsonValue } from '../../domain';
import type { ProbeConfigField } from './registry';
import { ProbeConfigError } from './registry';

const MAX_STRING_LENGTH = 500;
const MAX_LIST_ITEMS = 100;

export type ProbeConfigValues = Record<string, JsonValue>;

/**
 * 按字段描述校验点位参数并套用默认值。未知字段直接报错，避免拼错的键静默失效。
 */
export function parseProbeConfig(fields: readonly ProbeConfigField[], raw: unknown): ProbeConfigValues {
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new ProbeConfigError('探针参数必须是 JSON 对象');
  }
  const input = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(fields.map((field) => field.key));
  const unknownKeys = Object.keys(input).filter((key) => !known.has(key));
  if (unknownKeys.length > 0) throw new ProbeConfigError(`探针参数包含未知字段：${unknownKeys.join('、')}`);

  const values: ProbeConfigValues = {};
  for (const field of fields) {
    const value = input[field.key] ?? field.default;
    if (value === undefined) {
      if (field.required) throw new ProbeConfigError(`探针参数缺少必填字段：${field.label}`);
      continue;
    }
    values[field.key] = validateField(field, value);
  }
  return values;
}

function validateField(field: ProbeConfigField, value: unknown): JsonValue {
  switch (field.kind) {
    case 'string': {
      if (typeof value !== 'string') throw new ProbeConfigError(`${field.label} 必须是字符串`);
      const trimmed = value.trim();
      if (!trimmed && field.required) throw new ProbeConfigError(`${field.label} 不能为空`);
      if (trimmed.length > MAX_STRING_LENGTH) {
        throw new ProbeConfigError(`${field.label} 长度不能超过 ${MAX_STRING_LENGTH}`);
      }
      if (field.options && !field.options.includes(trimmed)) {
        throw new ProbeConfigError(`${field.label} 只能是：${field.options.join('、')}`);
      }
      return trimmed;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new ProbeConfigError(`${field.label} 必须是整数`);
      }
      if (field.minimum !== undefined && value < field.minimum) {
        throw new ProbeConfigError(`${field.label} 不能小于 ${field.minimum}`);
      }
      if (field.maximum !== undefined && value > field.maximum) {
        throw new ProbeConfigError(`${field.label} 不能大于 ${field.maximum}`);
      }
      return value;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new ProbeConfigError(`${field.label} 必须是布尔值`);
      return value;
    }
    case 'string-list': {
      if (!Array.isArray(value)) throw new ProbeConfigError(`${field.label} 必须是字符串数组`);
      const limit = field.maximumItems ?? MAX_LIST_ITEMS;
      if (value.length > limit) throw new ProbeConfigError(`${field.label} 最多 ${limit} 项`);
      return value.map((item) => {
        if (typeof item !== 'string' || !item.trim()) {
          throw new ProbeConfigError(`${field.label} 只能包含非空字符串`);
        }
        return item.trim();
      });
    }
    default: {
      throw new Error('未实现的探针字段类型');
    }
  }
}

/**
 * 取值助手。字段类型已由 `parseProbeConfig` 保证，这里只做断言，不重复校验。
 */
export function probeString(values: ProbeConfigValues, key: string): string {
  return values[key] as string;
}

export function probeInteger(values: ProbeConfigValues, key: string): number {
  return values[key] as number;
}

export function probeBoolean(values: ProbeConfigValues, key: string): boolean {
  return values[key] as boolean;
}
