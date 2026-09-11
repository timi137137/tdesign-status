import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const publicRoutes = ['/', '/history', '/maintenances'];

for (const route of publicRoutes) {
  test(`${route} 可访问且无严重无障碍问题`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('main, #main-content')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect
      .poll(async () =>
        page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--td-bg-color-page').trim()),
      )
      .not.toBe('');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);
  });
}

test('公开首页卡片与总览横幅有可见样式', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('组件状态')).toBeVisible();
  const banner = page.locator('.status-banner').first();
  await expect(banner).toBeVisible();
  const styles = await banner.evaluate((el) => {
    const computed = getComputedStyle(el);
    const page = getComputedStyle(document.body);
    return {
      background: computed.backgroundColor,
      color: computed.color,
      pageToken: page.getPropertyValue('--td-bg-color-page').trim(),
      pageBackground: page.backgroundColor,
      stylesheets: [...document.styleSheets].filter((sheet) => {
        try {
          return Boolean(sheet.href || sheet.cssRules.length);
        } catch {
          return Boolean(sheet.href);
        }
      }).length,
    };
  });
  expect(styles.stylesheets).toBeGreaterThan(0);
  expect(styles.pageToken).not.toBe('');
  expect(styles.pageBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');

  const icon = banner.locator('.status-banner__icon');
  await expect(icon).toBeVisible();
  const iconBox = await icon.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      paths: el.querySelectorAll('path').length,
    };
  });
  expect(iconBox.width).toBeGreaterThan(24);
  expect(iconBox.height).toBeGreaterThan(24);
  expect(iconBox.paths).toBeGreaterThan(0);
});

test('公开首页在离线刷新后展示最后已知状态', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('组件状态')).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('组件状态')).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('当前处于离线状态')).toBeVisible();
  await expect(page.getByText('组件状态')).toBeVisible();
});
