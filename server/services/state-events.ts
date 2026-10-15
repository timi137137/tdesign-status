/**
 * `service_state_events.reason` 的取值。写入方是探针与后台，读取方是后台与长历史渲染，
 * 共用一套标签才不会各自发明说法。
 */
export const STATE_EVENT_REASON = {
  /** 开始留痕：首次观测或服务刚建立。 */
  observationStarted: 'observation_started',
  /** 服务级状态由点位聚合而来。 */
  probeAggregate: 'probe_aggregate',
  /** 人工在后台改状态。 */
  manual: 'manual',
} as const;
