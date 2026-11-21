/* App shell only. User mail and mailbags never enter the service-worker cache. */
const VERSION = '1.5.0-rc.1';
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `sneakernet-shell:${SCOPE}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const REQUIRED_FILES = [
  "index.html",
  "styles.css",
  "src/launch.js",
  "src/app.js",
  "src/core.js",
  "src/storage.js",
  "src/experience.js",
  "src/carrier.js",
  "src/desk-view.js",
  "src/reader.js",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "manifest.webmanifest"
];
// BEGIN GENERATED SHELL INTEGRITY
const REQUIRED_INTEGRITY = {
  "index.html": "sha256-kBsrl0Y3px8ffcSbiVIPxsBDM3O9q3Fhtmc+oaaaow4=",
  "styles.css": "sha256-LzH1zq0J+XFgNnHayffaul/T/RS9xEaFypW6QN6KgMo=",
  "src/launch.js": "sha256-DGKNX4fjE4m7i+HZWo24OvGsIeW9HUcgfoODTWlRL40=",
  "src/app.js": "sha256-7E+permhhp3nRRtOyzYqvizN2VfV9fXoPNVN/S1Yiqs=",
  "src/core.js": "sha256-FKGU3mjtwNvqWv0ek5xrOforF/okPtPmocjFZ/LOVvY=",
  "src/storage.js": "sha256-ttEf1f4JU/HDMMJ6hTtLePbt3dWPaDrlgCIY91P7t1Y=",
  "src/experience.js": "sha256-f0W5DG2rC7Lk1QIGE9ehNkcvb//Lk10uNF/PgZs42HE=",
  "src/carrier.js": "sha256-CN9i1dJg7Z7VZX8506sUWF3TVf8IXomAY71NStxm8KM=",
  "src/desk-view.js": "sha256-GxoMqegL+tjchFUb/v4uML6G5QQPP8AcQFDEeslRZ0o=",
  "src/reader.js": "sha256-iG7pMo7ozbuhYxmylJLVJ0EPol4kJ1r4v3QvnZfA+HI=",
  "assets/icon.svg": "sha256-Z2TuWwFhXnV0OpLtjkW9CZ/HJGuaTXG8GsSEUJq+zWg=",
  "assets/icon-192.png": "sha256-L0HSdkEEqZIJ9Ae5DOyz+mjJ3lmfjisQAcKWHuEuT6g=",
  "assets/icon-512.png": "sha256-f+Oyl8wWXydIHiS4tniTe3MDX/Y7/diKiVTcnEH1Hhs=",
  "manifest.webmanifest": "sha256-85cVCqtoGM7xWz3/bp1TnS7Tzx4ey05uqGucnGgt9vY="
};
// END GENERATED SHELL INTEGRITY
const REQUIRED_URLS = REQUIRED_FILES.map(path => new URL(path, SCOPE).href);
const INTEGRITY_BY_URL = new Map(REQUIRED_FILES.map(path => [new URL(path, SCOPE).href, REQUIRED_INTEGRITY[path]]));
const SHELL_URL = new URL('index.html', SCOPE).href;

function assetRequest(url) {
  const integrity = INTEGRITY_BY_URL.get(url);
  if (!integrity) throw new Error('This app release is missing an offline asset checksum.');
  return new Request(url, { cache: 'reload', integrity });
}

function releaseOrder(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.exec(version);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  if (!parts.every(Number.isSafeInteger) || (match[4] && !Number.isSafeInteger(Number(match[4])))) return null;
  return [...parts, match[4] === undefined ? Infinity : Number(match[4])];
}

function isOlderRelease(name) {
  if (!name.startsWith(CACHE_PREFIX)) return false;
  const candidate = releaseOrder(name.slice(CACHE_PREFIX.length));
  const current = releaseOrder(VERSION);
  if (!candidate || !current) return false;
  for (let index = 0; index < current.length; index++) {
    if (candidate[index] !== current[index]) return candidate[index] < current[index];
  }
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll is atomic. Fetch also verifies each request's integrity metadata,
    // so an interrupted deployment cannot install a mixture of release files.
    await cache.addAll(REQUIRED_URLS.map(assetRequest));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // A newer worker may already be installing in parallel. Never delete its
    // cache, a same-version cache, an unknown version, or another app's cache.
    await Promise.all(names.filter(isOlderRelease).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scopeUrl = new URL(SCOPE);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;
  const cleanUrl = new URL(url.pathname, url.origin).href;
  const isShell = event.request.mode === 'navigate' && (cleanUrl === SCOPE || cleanUrl === SHELL_URL);
  const asset = REQUIRED_URLS.includes(cleanUrl) ? cleanUrl : null;
  if (!isShell && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isShell ? SHELL_URL : asset);
    if (cached) return cached;
    // Repair only with the exact bytes this worker was released with. A newer
    // host deployment must install its own complete worker instead of entering
    // an older cached shell through a missing-asset request.
    const response = await fetch(assetRequest(isShell ? SHELL_URL : asset));
    if (response.ok) {
      try { await cache.put(isShell ? SHELL_URL : asset, response.clone()); }
      catch { /* Online reading can continue when cache storage is unavailable. */ }
    }
    return response;
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_OFFLINE_READY') return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const entries = await Promise.all(REQUIRED_URLS.map(url => cache.match(url)));
      const missing = REQUIRED_URLS.filter((url, index) => !entries[index]);
      if (missing.length) {
        // A normal connected reopen repairs icons and other assets that the
        // current page may not request. Never fetch outside the app allowlist.
        try { await cache.addAll(missing.map(assetRequest)); }
        catch { /* Offline, a failed request, or full storage leaves ready false. */ }
      }
      const confirmed = await Promise.all(REQUIRED_URLS.map(url => cache.match(url)));
      ready = confirmed.every(Boolean);
    } catch { /* The client can show setup incomplete. */ }
    const response = { type: 'OFFLINE_READY', ready, version: VERSION };
    if (event.ports[0]) event.ports[0].postMessage(response);
    else event.source?.postMessage(response);
  })());
});
