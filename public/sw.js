// Minimal service worker so the companion can be installed as an app (installed apps get
// persistent storage). It deliberately caches nothing: the app is served locally and every
// launch should get the current build.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
