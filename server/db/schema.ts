import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { JsonObject, PublicIncident, PublicMaintenance, PublicSnapshotValue, SiteConfigValue } from '../domain';
import {
  INCIDENT_IMPACTS,
  INCIDENT_STATUSES,
  MAINTENANCE_STATUSES,
  PUBLISH_STATES,
  SERVICE_STATUSES,
  USER_ROLES,
} from '../domain';

const now = sql`(unixepoch() * 1000)`;

function lifecycleColumns() {
  return {
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at').notNull().default(now),
    createdBy: text('created_by'),
    updatedAt: integer('updated_at').notNull().default(now),
    updatedBy: text('updated_by'),
    deletedAt: integer('deleted_at'),
    deletedBy: text('deleted_by'),
  };
}

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: integer('locked_until'),
    lastLoginAt: integer('last_login_at'),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('users_username_unique')
      .on(table.username)
      .where(sql`${table.deletedAt} is null`),
    index('users_role_active_idx').on(table.role, table.isActive, table.deletedAt),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull().default(now),
    revokedAt: integer('revoked_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_expiry_idx').on(table.userId, table.expiresAt, table.revokedAt),
  ],
);

export const siteConfigs = sqliteTable('site_configs', {
  id: text('id').primaryKey(),
  draftJson: text('draft_json', { mode: 'json' }).$type<SiteConfigValue>().notNull(),
  publishedJson: text('published_json', { mode: 'json' }).$type<SiteConfigValue>(),
  publishedAt: integer('published_at'),
  ...lifecycleColumns(),
});

export const services = sqliteTable(
  'services',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: SERVICE_STATUSES }).notNull().default('up'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull().default(0),
    uptime: real('uptime').notNull().default(100),
    latencyMs: integer('latency_ms').notNull().default(0),
    lastCheckAt: integer('last_check_at').notNull().default(now),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('services_slug_unique')
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('services_public_order_idx').on(table.enabled, table.position, table.deletedAt),
  ],
);

export const serviceProbes = sqliteTable(
  'service_probes',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** 对应探针注册表里的类型名（http / tcp / …）。 */
    type: text('type').notNull(),
    target: text('target').notNull(),
    configJson: text('config_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    intervalSeconds: integer('interval_seconds').notNull(),
    region: text('region'),
    position: integer('position').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastCheckedAt: integer('last_checked_at'),
    lastStatus: text('last_status', { enum: SERVICE_STATUSES }),
    lastLatencyMs: integer('last_latency_ms'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('service_probes_service_name_unique')
      .on(table.serviceId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index('service_probes_service_idx').on(table.serviceId, table.position, table.deletedAt),
    index('service_probes_due_idx').on(table.enabled, table.deletedAt),
  ],
);

export const serviceSamples = sqliteTable(
  'service_samples',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    /** 产出该样本的监控点位；人工写入的样本为空。 */
    probeId: text('probe_id').references(() => serviceProbes.id, { onDelete: 'cascade' }),
    observedAt: integer('observed_at').notNull(),
    status: text('status', { enum: SERVICE_STATUSES }).notNull(),
    heartbeatValue: integer('heartbeat_value').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    ...lifecycleColumns(),
  },
  (table) => [
    index('service_samples_service_time_idx').on(table.serviceId, table.observedAt),
    index('service_samples_retention_idx').on(table.observedAt, table.deletedAt),
  ],
);

export const serviceStateEvents = sqliteTable(
  'service_state_events',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    probeId: text('probe_id').references(() => serviceProbes.id, { onDelete: 'cascade' }),
    /** 状态变迁发生的时间。 */
    at: integer('at').notNull(),
    fromStatus: text('from_status', { enum: SERVICE_STATUSES }).notNull(),
    toStatus: text('to_status', { enum: SERVICE_STATUSES }).notNull(),
    /** 变迁原因，如 http_500 / timeout / probe_disabled。 */
    reason: text('reason'),
    ...lifecycleColumns(),
  },
  (table) => [index('service_state_events_service_idx').on(table.serviceId, table.at, table.deletedAt)],
);

export const incidents = sqliteTable(
  'incidents',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    impact: text('impact', { enum: INCIDENT_IMPACTS }).notNull().default('none'),
    status: text('status', { enum: INCIDENT_STATUSES }).notNull().default('investigating'),
    startedAt: integer('started_at').notNull(),
    resolvedAt: integer('resolved_at'),
    publishState: text('publish_state', { enum: PUBLISH_STATES }).notNull().default('draft'),
    publishedAt: integer('published_at'),
    publishedJson: text('published_json', { mode: 'json' }).$type<PublicIncident>(),
    ...lifecycleColumns(),
  },
  (table) => [
    index('incidents_status_started_idx').on(table.status, table.startedAt, table.deletedAt),
    index('incidents_public_idx').on(table.publishState, table.publishedAt, table.deletedAt),
  ],
);

export const incidentUpdates = sqliteTable(
  'incident_updates',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    status: text('status', { enum: INCIDENT_STATUSES }).notNull(),
    body: text('body').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    publishState: text('publish_state', { enum: PUBLISH_STATES }).notNull().default('draft'),
    publishedAt: integer('published_at'),
    ...lifecycleColumns(),
  },
  (table) => [index('incident_updates_parent_time_idx').on(table.incidentId, table.occurredAt, table.deletedAt)],
);

export const maintenances = sqliteTable(
  'maintenances',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: MAINTENANCE_STATUSES }).notNull().default('scheduled'),
    scheduledStart: integer('scheduled_start').notNull(),
    scheduledEnd: integer('scheduled_end').notNull(),
    progress: integer('progress').notNull().default(0),
    publishState: text('publish_state', { enum: PUBLISH_STATES }).notNull().default('draft'),
    publishedAt: integer('published_at'),
    publishedJson: text('published_json', { mode: 'json' }).$type<PublicMaintenance>(),
    ...lifecycleColumns(),
  },
  (table) => [
    index('maintenances_status_start_idx').on(table.status, table.scheduledStart, table.deletedAt),
    index('maintenances_public_idx').on(table.publishState, table.publishedAt, table.deletedAt),
  ],
);

export const maintenanceUpdates = sqliteTable(
  'maintenance_updates',
  {
    id: text('id').primaryKey(),
    maintenanceId: text('maintenance_id')
      .notNull()
      .references(() => maintenances.id, { onDelete: 'cascade' }),
    status: text('status', { enum: MAINTENANCE_STATUSES }).notNull(),
    body: text('body').notNull(),
    progress: integer('progress'),
    occurredAt: integer('occurred_at').notNull(),
    publishState: text('publish_state', { enum: PUBLISH_STATES }).notNull().default('draft'),
    publishedAt: integer('published_at'),
    ...lifecycleColumns(),
  },
  (table) => [index('maintenance_updates_parent_time_idx').on(table.maintenanceId, table.occurredAt, table.deletedAt)],
);

export const entityServices = sqliteTable(
  'entity_services',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type', { enum: ['incident', 'maintenance'] }).notNull(),
    entityId: text('entity_id').notNull(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('entity_services_unique').on(table.entityType, table.entityId, table.serviceId),
    index('entity_services_entity_idx').on(table.entityType, table.entityId, table.deletedAt),
    index('entity_services_service_idx').on(table.serviceId, table.deletedAt),
  ],
);

export const dashboardLayouts = sqliteTable(
  'dashboard_layouts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('default'),
    layoutJson: text('layout_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(true),
    ...lifecycleColumns(),
  },
  (table) => [
    uniqueIndex('dashboard_layouts_user_name_unique')
      .on(table.userId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index('dashboard_layouts_user_idx').on(table.userId, table.deletedAt),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    beforeJson: text('before_json', { mode: 'json' }).$type<JsonObject>(),
    afterJson: text('after_json', { mode: 'json' }).$type<JsonObject>(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<JsonObject>(),
    ...lifecycleColumns(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt, table.deletedAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId, table.createdAt),
  ],
);

export const publicSnapshots = sqliteTable('public_snapshots', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json', { mode: 'json' }).$type<PublicSnapshotValue>().notNull(),
  etag: text('etag').notNull(),
  lastModified: integer('last_modified').notNull(),
  ...lifecycleColumns(),
});

export type UserRow = typeof users.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type ServiceProbeRow = typeof serviceProbes.$inferSelect;
export type ServiceStateEventRow = typeof serviceStateEvents.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type MaintenanceRow = typeof maintenances.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
