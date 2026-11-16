// A service worker that does nothing. Some browsers only offer "Install app" for a site that has
// one. It deliberately stores nothing: the game must always load the newest version from the
// network, so the number on the menu is the truth.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
