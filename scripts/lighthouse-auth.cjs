module.exports = async (browser) => {
  const username = process.env.LHCI_USERNAME || process.env.STATUS_ADMIN_USERNAME;
  const password = process.env.LHCI_PASSWORD || process.env.STATUS_ADMIN_PASSWORD;
  const origin = process.env.LHCI_BASE_URL || 'http://127.0.0.1:3000';

  if (!username || !password) {
    throw new Error('Lighthouse 受保护页面审计需要 LHCI_USERNAME/LHCI_PASSWORD 环境变量');
  }

  const page = await browser.newPage();
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle0' });
  if (new URL(page.url()).pathname !== '/login') {
    await page.close();
    return;
  }

  await page.type('input[autocomplete="username"]', username);
  await page.type('input[autocomplete="current-password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname !== '/login', { timeout: 15_000 });
  await page.close();
};

