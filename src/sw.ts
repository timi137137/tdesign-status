/// <reference lib="webworker" />

import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  void self.skipWaiting();
});

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/api/public/'),
  new NetworkFirst({
    cacheName: 'status-public-api-v1',
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  }),
);

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    ['script', 'style', 'image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'status-static-v2',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          const type = response.headers.get('content-type') || '';
          if (!response.ok || type.includes('text/html')) return null;
          return response;
        },
      },
      new ExpirationPlugin({
        maxEntries: 160,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);

const navigationHandler = createHandlerBoundToURL('/index.html');
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      navigationHandler({ event, request: event.request, url: new URL(event.request.url) }),
    ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('status-static-v1').then(() => self.clients.claim()));
});
