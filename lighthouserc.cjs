const origin = process.env.LHCI_BASE_URL || 'http://127.0.0.1:3000';

const paths = [
  '/',
  '/history',
  '/maintenances',
  '/login',
  '/dashboard/overview',
  '/status/site',
  '/status/services',
  '/status/incidents',
  '/status/incidents/inc-tx-001',
  '/status/maintenances',
  '/status/maintenances/mnt-pay-clearing',
  '/system/users',
  '/system/audit',
  '/user/index',
  '/result/success',
  '/result/fail',
  '/result/network-error',
  '/result/403',
  '/result/404',
  '/result/500',
  '/result/browser-incompatible',
  '/result/maintenance',
];

module.exports = {
  ci: {
    collect: {
      url: paths.map((path) => `${origin}${path}`),
      numberOfRuns: Number.parseInt(process.env.LHCI_NUMBER_OF_RUNS || '3', 10) || 3,
      startServerCommand: process.env.LHCI_SKIP_SERVER ? '' : 'npm run start:test',
      startServerReadyPattern: 'Server listening|listening at',
      startServerReadyTimeout: 120_000,
      puppeteerScript: './scripts/lighthouse-auth.cjs',
      settings: {
        onlyCategories: ['performance', 'accessibility'],
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        disableStorageReset: true,
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*/history/?$',
          assertions: {
            'categories:performance': ['error', { minScore: 0.95 }],
            'categories:accessibility': ['error', { minScore: 0.8 }],
          },
        },
        {
          matchingUrlPattern: 'https?://[^/]+/(?:maintenances|login)?/?$',
          assertions: {
            'categories:performance': ['error', { minScore: 0.99 }],
            'categories:accessibility': ['error', { minScore: 0.8 }],
          },
        },
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': ['warn', { minScore: 0.5 }],
            'categories:accessibility': ['error', { minScore: 0.8 }],
          },
        },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-reports',
    },
  },
};
