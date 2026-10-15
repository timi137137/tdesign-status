import type { ProbeRegistry } from './registry';
import { createProbeRegistry } from './registry';
import { httpProbe } from './types/http';
import { tcpProbe } from './types/tcp';

/** 内置探针类型作为预装插件注册；插件加载器接入后向同一注册表追加第三方类型。 */
export function createBuiltinProbeRegistry(): ProbeRegistry {
  const registry = createProbeRegistry();
  registry.register(httpProbe);
  registry.register(tcpProbe);
  return registry;
}
