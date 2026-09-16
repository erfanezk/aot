import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { createPartialResponse } from 'workbox-range-requests';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

setCacheNameDetails({ prefix: 'aot' });

// Audio playback/seeking asks for byte ranges. Slice the full cached MP3
// instead of requesting it again or caching an incomplete 206 response.
registerRoute(
  ({ request, url }) => url.origin === self.location.origin
    && url.pathname.startsWith(new URL(self.registration.scope).pathname)
    && request.headers.has('range'),
  async ({ request }) => {
    const cached = await matchPrecache(request.url);
    return cached ? createPartialResponse(request, cached) : fetch(request);
  },
);

// The build injects content revisions for every shipped asset, including GLBs.
// Workbox reuses unchanged entries and removes obsolete ones on activation.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'aot-google-font-styles',
    plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'aot-google-font-files',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);

// Control the first visit once caching finishes. Updates wait for existing
// game tabs to close so an active game never mixes assets from two releases.
clientsClaim();
