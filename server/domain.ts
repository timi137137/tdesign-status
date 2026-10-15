import type { ServiceStatus, UserRole } from '../shared/public-contract';

export type {
  EntityType,
  IncidentImpact,
  IncidentStatus,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  MaintenanceStatus,
  OverallStatusSummary,
  PublicHistoryEntry,
  PublicIncident,
  PublicMaintenance,
  PublicService,
  PublicSnapshotResponse,
  PublicSnapshotValue,
  PublicStatusUpdate,
  PublishState,
  ServiceStatus,
  SiteConfigValue,
  UserRole,
} from '../shared/public-contract';
export {
  canTransitionIncidentStatus,
  canTransitionMaintenanceStatus,
  INCIDENT_IMPACTS,
  INCIDENT_STATUS_TRANSITIONS,
  INCIDENT_STATUSES,
  MAINTENANCE_STATUS_TRANSITIONS,
  MAINTENANCE_STATUSES,
  PUBLISH_STATES,
  SERVICE_STATUSES,
  USER_ROLES,
} from '../shared/public-contract';

export interface SessionPrincipal {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  userVersion: number;
  sessionId: string;
  sessionTokenHash: string;
}

export function heartbeatValueForStatus(status: ServiceStatus): number {
  if (status === 'down') return 0;
  if (status === 'maintenance') return 2;
  if (status === 'degraded') return 3;
  return 1;
}
