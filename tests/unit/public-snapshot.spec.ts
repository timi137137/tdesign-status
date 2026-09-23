import { describe, expect, it } from 'vitest';

import { mapPublicSnapshot } from '@/utils/public-snapshot';

describe('mapPublicSnapshot', () => {
  it('把后端 siteConfig / 活动项 / 最近历史映射成公开页 store 形状', () => {
    const snapshot = mapPublicSnapshot({
      version: 3,
      generatedAt: 1000,
      siteConfig: {
        siteName: '腾讯服务状态',
        title: '运行状态',
        timezone: 'Asia/Shanghai',
        componentSubtitle: '自定义组件说明',
        historySubtitle: '自定义历史说明',
        footerText: '自定义页脚',
      },
      services: [
        {
          id: 'wechat',
          name: '微信',
          status: 'up',
          enabled: true,
          order: 0,
          heartbeats: [1, 0, 2],
          dailyHeartbeats: [1],
          latency: 40,
        },
      ],
      overall: {
        status: 'up',
        title: '所有服务正常',
        message: 'All Systems Operational',
        upCount: 1,
        downCount: 0,
        maintenanceCount: 0,
        degradedCount: 0,
        total: 1,
      },
      activeIncidents: [],
      activeMaintenances: [
        {
          id: 'mnt-pay-clearing',
          title: '微信支付日终清算窗口',
          status: 'scheduled',
          scheduledStart: 2000,
          scheduledEnd: 3000,
          progress: 0,
          affectedServiceIds: ['wechat-pay'],
          updates: [],
        },
      ],
      recentHistory: [
        {
          type: 'incident',
          at: 900,
          incident: {
            id: 'inc-tx-001',
            title: '消息发送延迟升高（北京）',
            impact: 'minor',
            status: 'resolved',
            affectedServiceIds: ['wechat'],
            updates: [],
            startedAt: 800,
          },
        },
      ],
    });

    expect(snapshot.site.text.headerTitle).toBe('运行状态');
    expect(snapshot.site.text.componentSubtitle).toBe('自定义组件说明');
    expect(snapshot.site.text.historySubtitle).toBe('自定义历史说明');
    expect(snapshot.site.text.footerText).toBe('自定义页脚');
    expect(snapshot.services[0].autoSimulate).toBe(false);
    expect(snapshot.services[0].heartbeats).toEqual([1, 0, 2]);
    expect(snapshot.incidents.map((item) => item.id)).toEqual(['inc-tx-001']);
    expect(snapshot.maintenances.map((item) => item.id)).toEqual(['mnt-pay-clearing']);
    expect(snapshot.version).toBe(3);
  });
});
