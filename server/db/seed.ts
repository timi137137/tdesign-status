import { randomUUID } from 'node:crypto';

import { count } from 'drizzle-orm';

import { hashPassword, validatePassword } from '../auth/password';
import { loadConfig } from '../config';
import type { IncidentImpact, IncidentStatus, PublicIncident, PublicMaintenance, ServiceStatus } from '../domain';
import { writeAudit } from '../services/audit';
import { DEFAULT_SITE_CONFIG, rebuildPublicSnapshot } from '../services/snapshot';
import { normalizeUsername } from '../utils/validation';
import { openDatabase } from './client';
import { applyMigrations } from './migrate';
import {
  entityServices,
  incidents,
  incidentUpdates,
  maintenances,
  maintenanceUpdates,
  services,
  serviceSamples,
  siteConfigs,
  users,
} from './schema';

const SERVICE_SEEDS: Array<{
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  baseLatency: number;
}> = [
  { id: 'wechat', name: '微信', description: '消息、登录与朋友圈等核心链路', status: 'up', baseLatency: 62 },
  { id: 'qq', name: 'QQ', description: '即时通讯、群与文件传输', status: 'up', baseLatency: 70 },
  { id: 'wecom', name: '企业微信', description: '办公通讯、文档与会议互通', status: 'up', baseLatency: 75 },
  { id: 'wechat-pay', name: '微信支付', description: '付款、收款与商户回调', status: 'up', baseLatency: 35 },
  { id: 'meeting', name: '腾讯会议', description: '入会、音视频与录制', status: 'up', baseLatency: 85 },
  { id: 'video', name: '腾讯视频', description: '点播、直播与会员鉴权', status: 'up', baseLatency: 95 },
  { id: 'qcloud-cvm', name: '云服务器 CVM', description: '腾讯云计算实例与售卖', status: 'up', baseLatency: 50 },
  { id: 'qcloud-cos', name: '对象存储 COS', description: '对象上传、下载与跨地域复制', status: 'up', baseLatency: 46 },
  { id: 'qcloud-cdn', name: '内容分发 CDN', description: '腾讯云边缘加速与缓存', status: 'up', baseLatency: 28 },
  { id: 'honor', name: '王者荣耀', description: '登录、匹配与对局战斗', status: 'up', baseLatency: 82 },
  { id: 'pubg', name: '和平精英', description: '大厅、匹配与战斗同步', status: 'up', baseLatency: 88 },
];

const SCENARIOS: Record<string, readonly string[]> = {
  wechat: ['消息发送延迟升高', '朋友圈图片加载失败', '语音通话掉线增多'],
  qq: ['消息同步延迟', '群文件下载失败', '设备锁校验超时'],
  wecom: ['消息已读回执延迟', '文档协同冲突增多', '通讯录拉取超时'],
  'wechat-pay': ['扣款回执超时', '商户回调堆积', '退款到账延迟'],
  meeting: ['入会排队升高', '共享屏幕卡顿', '录制上传失败'],
  video: ['起播缓冲变长', '会员鉴权超时', '直播间延迟升高'],
  'qcloud-cvm': ['控制台列表超时', '实例创建排队', '快照任务积压'],
  'qcloud-cos': ['上传 5xx 升高', '跨地域复制延迟', '下载链路抖动'],
  'qcloud-cdn': ['回源超时升高', '证书探测失败', 'HTTPS 握手变慢'],
  honor: ['登录排队升高', '匹配超时增多', '战斗同步丢包'],
  pubg: ['大厅登录失败', '匹配超时', '好友组队失败'],
};

const REGIONS = ['北京', '上海', '广州', '深圳', '成都', '重庆', '南京', '香港', '新加坡', '东京'];
const IMPACTS: IncidentImpact[] = ['none', 'minor', 'major', 'critical'];
const INCIDENT_FLOW: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved'];
const INCIDENT_BODIES = [
  '监控发现指标偏离基线，正在确认影响地域与用户规模。',
  '已定位到局部集群异常，正在隔离并回滚相关变更。',
  '流量已切至健康集群，核心指标回落，继续观察。',
  '指标恢复至基线，本事件关闭。',
];

const MAINTENANCE_SEEDS = [
  {
    id: 'mnt-pay-clearing',
    title: '微信支付日终清算窗口',
    description: '对清算与对账集群做例行维护，期间商户回调可能短暂延迟。',
    serviceId: 'wechat-pay',
    startHours: 36,
    durationHours: 4,
  },
  {
    id: 'mnt-cos-gz-expand',
    title: '对象存储 COS 广州地域扩容',
    description: '扩容广州地域存储集群，窗口内跨地域复制可能排队。',
    serviceId: 'qcloud-cos',
    startHours: 72,
    durationHours: 8,
  },
  {
    id: 'mnt-meeting-cluster',
    title: '腾讯会议媒体集群滚动升级',
    description: '滚动升级媒体转发集群，入会排队可能短暂升高。',
    serviceId: 'meeting',
    startHours: 24,
    durationHours: 6,
  },
  {
    id: 'mnt-pubg-patch',
    title: '和平精英版本资源预热',
    description: '预热新版本资源包并切换大厅入口，窗口内匹配可能排队。',
    serviceId: 'pubg',
    startHours: 96,
    durationHours: 4,
  },
];

function heartbeatValue(status: ServiceStatus): number {
  if (status === 'down') return 0;
  if (status === 'maintenance') return 2;
  if (status === 'degraded') return 3;
  return 1;
}

async function seed(): Promise<void> {
  const config = loadConfig();
  const context = openDatabase(config);

  try {
    applyMigrations(context, config.migrationsPath);
    const result = await seedFreshDatabase(context, { requireAdminEnv: true });
    if (result === 'skipped') {
      throw new Error('数据库不是 fresh DB；为避免覆盖数据，seed 已停止');
    }
  } finally {
    context.close();
  }
}

export async function seedFreshDatabase(
  context: ReturnType<typeof openDatabase>,
  options: { requireAdminEnv?: boolean } = {},
): Promise<'seeded' | 'skipped'> {
  const adminUsernameValue = process.env.STATUS_ADMIN_USERNAME;
  const adminPassword = process.env.STATUS_ADMIN_PASSWORD;
  if (!adminUsernameValue || !adminPassword) {
    if (options.requireAdminEnv !== false) {
      throw new Error('显式 seed 需要 STATUS_ADMIN_USERNAME 和 STATUS_ADMIN_PASSWORD 环境变量');
    }
    return 'skipped';
  }
  const adminUsername = normalizeUsername(adminUsernameValue);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(adminUsername)) {
    throw new Error('STATUS_ADMIN_USERNAME 仅允许 3-64 位小写字母、数字、点、下划线和连字符');
  }
  validatePassword(adminPassword);

  const userCount = context.db.select({ value: count() }).from(users).get()?.value ?? 0;
  const serviceCount = context.db.select({ value: count() }).from(services).get()?.value ?? 0;
  if (userCount > 0 || serviceCount > 0) {
    return 'skipped';
  }

  const mustChangePassword = process.env.STATUS_ADMIN_MUST_CHANGE !== 'false';
  const passwordHash = await hashPassword(adminPassword);
  const now = Date.now();
  const adminId = randomUUID();
  const transaction = context.sqlite.transaction(() => {
    context.db
      .insert(users)
      .values({
        id: adminId,
        username: adminUsername,
        displayName: process.env.STATUS_ADMIN_DISPLAY_NAME?.trim() || adminUsername,
        passwordHash,
        role: 'administrator',
        isActive: true,
        mustChangePassword,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();

    seedDemoData(context, adminId, now);
  });

  transaction();
  process.stdout.write(`Seed 完成：管理员 ${adminUsername}、11 个服务、160 个历史事件、4 个计划维护\n`);
  return 'seeded';
}

function seedDemoData(context: ReturnType<typeof openDatabase>, adminId: string, now: number): void {
  context.db
    .insert(siteConfigs)
    .values({
      id: 'default',
      draftJson: DEFAULT_SITE_CONFIG,
      publishedJson: DEFAULT_SITE_CONFIG,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: adminId,
      updatedBy: adminId,
    })
    .run();

  for (const [position, service] of SERVICE_SEEDS.entries()) {
    context.db
      .insert(services)
      .values({
        id: service.id,
        slug: service.id,
        name: service.name,
        description: service.description,
        status: service.status,
        enabled: true,
        position,
        uptime: 99.95,
        latencyMs: service.baseLatency,
        lastCheckAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();

    for (let day = 59; day >= 0; day -= 1) {
      const observedAt = now - day * 24 * 60 * 60 * 1000;
      const degraded = (day + position * 3) % 23 === 0;
      const down = (day + position * 7) % 53 === 0;
      let sampleStatus: ServiceStatus = 'up';
      if (down) sampleStatus = 'down';
      else if (degraded) sampleStatus = 'degraded';
      const latency = sampleStatus === 'down' ? 0 : service.baseLatency + ((day * 7 + position) % 35);
      let sampleUptime = 100;
      if (down) sampleUptime = 98.33;
      else if (degraded) sampleUptime = 99.5;
      context.db
        .insert(serviceSamples)
        .values({
          id: `${service.id}-sample-${String(day).padStart(2, '0')}`,
          serviceId: service.id,
          observedAt,
          status: sampleStatus,
          heartbeatValue: heartbeatValue(sampleStatus),
          latencyMs: latency,
          uptime: sampleUptime,
          createdAt: now,
          updatedAt: now,
          createdBy: adminId,
          updatedBy: adminId,
        })
        .run();
    }
  }

  for (let index = 0; index < 160; index += 1) {
    const service = SERVICE_SEEDS[index % SERVICE_SEEDS.length];
    const incidentId = `inc-tx-${String(index + 1).padStart(3, '0')}`;
    const startedAt = now - (index + 1) * 30 * 60 * 60 * 1000;
    const resolvedAt = startedAt + (2 + (index % 7)) * 60 * 60 * 1000;
    const scenarioList = SCENARIOS[service.id];
    const title = `${scenarioList[index % scenarioList.length]}（${REGIONS[index % REGIONS.length]}）`;
    const updates = INCIDENT_FLOW.map((status, updateIndex) => ({
      id: `${incidentId}-u${updateIndex + 1}`,
      at: startedAt + updateIndex * 40 * 60 * 1000,
      status,
      body: INCIDENT_BODIES[updateIndex],
    }));
    const payload: PublicIncident = {
      id: incidentId,
      title,
      impact: IMPACTS[index % IMPACTS.length],
      status: 'resolved',
      affectedServiceIds: [service.id],
      updates,
      startedAt,
      resolvedAt,
      version: 1,
      updatedAt: resolvedAt,
    };

    context.db
      .insert(incidents)
      .values({
        id: incidentId,
        title,
        impact: payload.impact,
        status: 'resolved',
        startedAt,
        resolvedAt,
        publishState: 'published',
        publishedAt: resolvedAt,
        publishedJson: payload,
        createdAt: startedAt,
        updatedAt: resolvedAt,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();
    context.db
      .insert(entityServices)
      .values({
        id: randomUUID(),
        entityType: 'incident',
        entityId: incidentId,
        serviceId: service.id,
        createdAt: startedAt,
        updatedAt: resolvedAt,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();
    for (const update of updates) {
      context.db
        .insert(incidentUpdates)
        .values({
          id: update.id,
          incidentId,
          status: update.status,
          body: update.body,
          occurredAt: update.at,
          publishState: 'published',
          publishedAt: resolvedAt,
          createdAt: update.at,
          updatedAt: resolvedAt,
          createdBy: adminId,
          updatedBy: adminId,
        })
        .run();
    }
  }

  for (const maintenance of MAINTENANCE_SEEDS) {
    const scheduledStart = now + maintenance.startHours * 60 * 60 * 1000;
    const scheduledEnd = scheduledStart + maintenance.durationHours * 60 * 60 * 1000;
    const updateId = `${maintenance.id}-u1`;
    const payload: PublicMaintenance = {
      id: maintenance.id,
      title: maintenance.title,
      description: maintenance.description,
      status: 'scheduled',
      scheduledStart,
      scheduledEnd,
      progress: 0,
      affectedServiceIds: [maintenance.serviceId],
      updates: [
        {
          id: updateId,
          at: now,
          status: 'scheduled',
          body: `已排期：${maintenance.title}。`,
        },
      ],
      version: 1,
      updatedAt: now,
    };
    context.db
      .insert(maintenances)
      .values({
        id: maintenance.id,
        title: maintenance.title,
        description: maintenance.description,
        status: 'scheduled',
        scheduledStart,
        scheduledEnd,
        progress: 0,
        publishState: 'published',
        publishedAt: now,
        publishedJson: payload,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();
    context.db
      .insert(maintenanceUpdates)
      .values({
        id: updateId,
        maintenanceId: maintenance.id,
        status: 'scheduled',
        body: `已排期：${maintenance.title}。`,
        progress: 0,
        occurredAt: now,
        publishState: 'published',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();
    context.db
      .insert(entityServices)
      .values({
        id: randomUUID(),
        entityType: 'maintenance',
        entityId: maintenance.id,
        serviceId: maintenance.serviceId,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .run();
  }

  writeAudit(context.db, null, {
    action: 'database.seeded',
    entityType: 'database',
    entityId: 'initial',
    actorUserId: adminId,
    metadata: {
      services: SERVICE_SEEDS.length,
      incidents: 160,
      maintenances: MAINTENANCE_SEEDS.length,
    },
  });
  rebuildPublicSnapshot(context.db, adminId);
}

if (require.main === module) {
  seed().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Seed 失败：${message}\n`);
    process.exitCode = 1;
  });
}
