import { describe, expect, it } from 'vitest';

import { LOCAL_ICONS } from '@/components/tdesign-icon/icons';

describe('LOCAL_ICONS', () => {
  it('覆盖后台模版用到的 name，避免再走 CDN sprite', () => {
    const required = ['dashboard', 'setting', 'precise-monitor', 'user', 'search', 'mail', 'view-list'];
    required.forEach((name) => {
      expect(LOCAL_ICONS[name]).toBeTruthy();
    });
  });
});
