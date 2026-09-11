import type { IncidentImpact, IncidentStatus, MaintenanceStatus, ServiceStatus } from '@/types/status';

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  up: '正常',
  down: '异常',
  maintenance: '维护中',
  degraded: '降级',
};

export const SERVICE_STATUS_THEME: Record<ServiceStatus, 'success' | 'danger' | 'primary' | 'warning'> = {
  up: 'success',
  down: 'danger',
  maintenance: 'primary',
  degraded: 'warning',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: '调查中',
  identified: '已定位',
  monitoring: '观察中',
  resolved: '已恢复',
};

export const INCIDENT_IMPACT_LABEL: Record<IncidentImpact, string> = {
  none: '无影响',
  minor: '轻微',
  major: '较大',
  critical: '严重',
};

export const INCIDENT_IMPACT_THEME: Record<IncidentImpact, 'default' | 'warning' | 'danger'> = {
  none: 'default',
  minor: 'warning',
  major: 'danger',
  critical: 'danger',
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  scheduled: '已排期',
  in_progress: '进行中',
  completed: '已完成',
};

export const MAINTENANCE_STATUS_THEME: Record<MaintenanceStatus, 'default' | 'primary' | 'success'> = {
  scheduled: 'default',
  in_progress: 'primary',
  completed: 'success',
};

/** 公开首页「计划与进行中的维护」折叠阈值，超出后用 Badge 进入全部页 */
export const HOME_MAINTENANCE_PREVIEW_LIMIT = 5;

/** 公开首页「事件与维护历史」预览条数，超出后从卡片右上角进入全部页 */
export const HOME_HISTORY_PREVIEW_LIMIT = 5;

/** 完整历史页每批加载条数；截断若落在当天中间则补齐当天 */
export const HISTORY_PAGE_BATCH_SIZE = 50;

/** 组件状态超过该数量后才考虑双列（等于该值仍垂直平铺） */
export const COMPONENT_GRID_THRESHOLD = 10;

/** 双列中间距，需与 `.component-list--grid` 的 gap 一致 */
export const COMPONENT_GRID_GAP = 16;

/** 半宽卡片最小宽度；两列加间距不够则保持单列 */
export const COMPONENT_GRID_MIN_COL_WIDTH = 360;

/** 组件列表可视宽度低于该值时不启用双列 */
export const COMPONENT_GRID_MIN_WIDTH = COMPONENT_GRID_MIN_COL_WIDTH * 2 + COMPONENT_GRID_GAP;

/** 双列半宽心跳条展示的天数（少于 60，格子更宽且不溢出） */
export const COMPACT_HEARTBEAT_DAYS = 30;

/** 公开页内容区与详情形态共用的移动端断点，对齐 layout 的 max-width: 768px */
export const PUBLIC_MOBILE_MAX_WIDTH = 768;

export const PUBLIC_MOBILE_MEDIA_QUERY = `(max-width: ${PUBLIC_MOBILE_MAX_WIDTH}px)`;

/** 桌面端右侧详情抽屉宽度 */
export const PUBLIC_DETAIL_DRAWER_SIZE = '480px';
