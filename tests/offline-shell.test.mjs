/**
 * NODE SERVICE-WORKER EVENT/CACHE SIMULATION — NOT BROWSER OFFLINE ACCEPTANCE.
 *
 * Evaluates the actual sw.js in a Node VM and serves actual release-file bytes
 * through an in-memory fetch/Cache API model. No browser, HTTP server, socket,
 * native file picker, or browser storage is used. Cache.addAll atomicity is a
 * modeled platform contract; these checks verify the worker's use of it, not
 * a browser's implementation. The browser acceptance matrix remains separate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const appRoot = new URL('../', import.meta.url);
const source = await readFile(new URL('sw.js', appRoot), 'utf8');
const releaseVersion = JSON.parse(await readFile(new URL('package.json', appRoot), 'utf8')).version;
const releaseFiles = [
  'index.html', 'styles.css', 'src/launch.js', 'src/app.js', 'src/core.js',
  'src/storage.js', 'src/experience.js', 'src/carrier.js', 'src/desk-view.js', 'src/reader.js', 'assets/icon.svg', 'assets/icon-192.png',
  'assets/icon-512.png', 'manifest.webmanifest',
];
const fileBytes = new Map(await Promise.all(releaseFiles.map(async name =>
  [name, await readFile(new URL(name, appRoot))]
)));

console.log('Node service-worker event/cache simulation using actual release bytes. NOT browser offline acceptance.');

function simulatedWorker({ scope = 'https://sneakernet.test/', missing = [] } = {}) {
  const listeners = new Map();
  const cacheStores = new Map();
  const networkCalls = [];
  const deletedCaches = [];
  const missingUrls = new Set(missing.map(path => new URL(path, scope).href));
  const responseBytes = new Map([...fileBytes].map(([path, bytes]) => [new URL(path, scope).href, bytes]));
  let offline = false;
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  const key = input => typeof input === 'string' ? input : input.url;
  const simulatedFetch = async request => {
    const url = key(request);
    networkCalls.push({ url, cache: request.cache, integrity: request.integrity });
    if (offline) throw new TypeError('Simulated network disconnected');
    const parsed = new URL(url);
    const clean = new URL(parsed.pathname, parsed.origin).href;
    const resource = clean === scope ? new URL('index.html', scope).href : clean;
    const bytes = responseBytes.get(resource);
    if (!bytes || missingUrls.has(resource)) return new Response('Simulated missing resource', { status: 404 });
    // Model Fetch's request-integrity contract. This is not browser proof of SRI.
    if (request.integrity && request.integrity !== `sha256-${createHash('sha256').update(bytes).digest('base64')}`) {
      throw new TypeError(`Simulated request integrity mismatch for ${url}`);
    }
    return new Response(bytes, { status: 200 });
  };
  const caches = {
    async open(name) {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const entries = cacheStores.get(name);
      return {
        async addAll(requests) {
          // Model the browser's all-or-nothing Cache.addAll contract.
          const staged = [];
          for (const request of requests) {
            const response = await simulatedFetch(request);
            if (!response.ok) throw new TypeError(`Cache.addAll rejected ${key(request)} (${response.status})`);
            staged.push([key(request), response]);
          }
          for (const [url, response] of staged) entries.set(url, response.clone());
        },
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response.clone()); },
        async delete(request) { return entries.delete(key(request)); },
      };
    },
    async keys() { return [...cacheStores.keys()]; },
    async delete(name) { deletedCaches.push(name); return cacheStores.delete(name); },
  };
  const self = {
    registration: { scope },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    async skipWaiting() { skipWaitingCalls++; },
    clients: { async claim() { claimCalls++; } },
  };
  vm.runInNewContext(source, { self, caches, fetch: simulatedFetch, URL, Request }, { filename: 'actual-release/sw.js' });

  async function dispatch(type, extra = {}) {
    const work = [];
    const event = { ...extra, waitUntil(promise) { work.push(Promise.resolve(promise)); } };
    for (const handler of listeners.get(type) ?? []) handler(event);
    await Promise.all(work);
  }
  async function request(path, { mode = 'cors', method = 'GET' } = {}) {
    const url = new URL(path, scope).href;
    let response;
    let intercepted = false;
    const event = {
      request: { url, mode, method },
      respondWith(promise) { assert.equal(intercepted, false); intercepted = true; response = Promise.resolve(promise); },
    };
    for (const handler of listeners.get('fetch') ?? []) handler(event);
    return { intercepted, response: intercepted ? await response : undefined };
  }
  async function readiness({ viaPort = true } = {}) {
    const messages = [];
    const target = { postMessage(message) { messages.push(structuredClone(message)); } };
    await dispatch('message', {
      data: { type: 'CHECK_OFFLINE_READY' },
      ports: viaPort ? [target] : [],
      source: viaPort ? undefined : target,
    });
    assert.equal(messages.length, 1, 'worker replies once to readiness query');
    return messages[0];
  }
  const cacheName = `sneakernet-shell:${scope}:${releaseVersion}`;
  return {
    scope, cacheName, cacheStores, networkCalls, deletedCaches,
    dispatch, request, readiness,
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; },
    disconnect() { offline = true; },
    reconnect() { offline = false; },
    evict(path) { cacheStores.get(cacheName)?.delete(new URL(path, scope).href); },
    hideResource(path) { missingUrls.add(new URL(path, scope).href); },
    changeResource(path, bytes) { responseBytes.set(new URL(path, scope).href, Buffer.from(bytes)); },
    seed(name, value = 'unrelated cache data') {
      cacheStores.set(name, new Map([['https://unrelated.test/record', new Response(value)]]));
    },
  };
}

async function assertBytes(response, expected, label) {
  assert.equal(response.status, 200, `${label}: cached status`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, `${label}: actual release bytes match`);
}

test('[Node SW simulation] successful install caches every actual runtime file and activates only after success', async () => {
  const worker = simulatedWorker();
  await worker.dispatch('install');
  const cache = worker.cacheStores.get(worker.cacheName);
  assert.equal(cache.size, releaseFiles.length);
  assert.deepEqual([...cache.keys()].sort(), releaseFiles.map(path => new URL(path, worker.scope).href).sort());
  for (const path of releaseFiles) await assertBytes(cache.get(new URL(path, worker.scope).href).clone(), fileBytes.get(path), path);
  assert.equal(worker.skipWaitingCalls, 1);
  assert.equal(worker.networkCalls.length, releaseFiles.length);
  assert.ok(worker.networkCalls.every(request => request.cache === 'reload'));
  for (const request of worker.networkCalls) {
    const path = releaseFiles.find(file => new URL(file, worker.scope).href === request.url);
    assert.equal(request.integrity, `sha256-${createHash('sha256').update(fileBytes.get(path)).digest('base64')}`, `${path}: request is bound to this release's bytes`);
  }
});

test('[Node SW simulation] a changed HTTP-200 asset prevents installing a mixed release and preserves the previous cache', async () => {
  const worker = simulatedWorker();
  const previous = `sneakernet-shell:${worker.scope}:1.2.0`;
  worker.seed(previous, 'Previously complete shell remains available.');
  const previousEntries = [...worker.cacheStores.get(previous)];
  worker.changeResource('src/core.js', '// A different deployed release returned HTTP 200.');
  await assert.rejects(() => worker.dispatch('install'), /integrity mismatch/);
  assert.equal(worker.skipWaitingCalls, 0);
  assert.equal(worker.cacheStores.get(worker.cacheName)?.size, 0);
  assert.deepEqual([...worker.cacheStores.get(previous)], previousEntries);
  assert.equal(worker.deletedCaches.length, 0);
});

test('[Node SW simulation] any one missing required asset rejects atomic installation', async () => {
  for (const missing of releaseFiles) {
    const worker = simulatedWorker({ missing: [missing] });
    await assert.rejects(() => worker.dispatch('install'), /Cache\.addAll rejected/, missing);
    assert.equal(worker.skipWaitingCalls, 0, `${missing}: failed install does not activate`);
    assert.equal(worker.cacheStores.get(worker.cacheName)?.size, 0, `${missing}: modeled atomic addAll leaves no partial shell`);
    assert.equal((await worker.readiness()).ready, false, `${missing}: never reports ready`);
  }
});

test('[Node SW simulation] activation removes only stale shell versions in this installation scope', async () => {
  const worker = simulatedWorker({ scope: 'https://sneakernet.test/club/' });
  await worker.dispatch('install');
  const stale = `sneakernet-shell:${worker.scope}:0.9.0`;
  const neighbor = 'sneakernet-shell:https://sneakernet.test/another-club/:0.9.0';
  const otherOrigin = 'sneakernet-shell:https://someone-else.test/club/:0.9.0';
  const future = `sneakernet-shell:${worker.scope}:9.0.0`;
  const unknown = `sneakernet-shell:${worker.scope}:custom-preview`;
  worker.seed(stale);
  worker.seed(neighbor);
  worker.seed(otherOrigin);
  worker.seed(future);
  worker.seed(unknown);
  worker.seed('unrelated-app-cache');
  await worker.dispatch('activate');
  assert.deepEqual(worker.deletedCaches, [stale]);
  for (const preserved of [worker.cacheName, neighbor, otherOrigin, future, unknown, 'unrelated-app-cache']) assert.ok(worker.cacheStores.has(preserved), preserved);
  assert.equal(worker.claimCalls, 1);
});

test('[Node SW simulation] a changed HTTP-200 repair leaves offline readiness false and the repair batch untouched', async () => {
  const worker = simulatedWorker();
  await worker.dispatch('install');
  worker.evict('styles.css');
  worker.evict('src/core.js');
  worker.changeResource('src/core.js', '// Newer core cannot enter the older shell.');
  assert.deepEqual(await worker.readiness(), { type: 'OFFLINE_READY', ready: false, version: releaseVersion });
  const cache = worker.cacheStores.get(worker.cacheName);
  assert.equal(cache.has(new URL('styles.css', worker.scope).href), false);
  assert.equal(cache.has(new URL('src/core.js', worker.scope).href), false);
  assert.equal(cache.size, releaseFiles.length - 2);
});

test('[Node SW simulation] direct repair refuses changed assets and shell bytes without caching or returning them', async () => {
  for (const [file, path, options] of [
    ['src/app.js', 'src/app.js?repair=1', {}],
    ['index.html', './?repair=1', { mode: 'navigate' }],
  ]) {
    const worker = simulatedWorker();
    await worker.dispatch('install');
    worker.evict(file);
    worker.changeResource(file, 'A different release or fallback page.');
    await assert.rejects(() => worker.request(path, options), /integrity mismatch/);
    assert.equal(worker.cacheStores.get(worker.cacheName).has(new URL(file, worker.scope).href), false);
    assert.equal((await worker.readiness()).ready, false);
  }
});

test('[Node SW simulation] readiness requires every required resource, including after eviction', async () => {
  const worker = simulatedWorker();
  worker.disconnect();
  assert.deepEqual(await worker.readiness(), { type: 'OFFLINE_READY', ready: false, version: releaseVersion });
  worker.reconnect();
  await worker.dispatch('install');
  assert.deepEqual(await worker.readiness(), { type: 'OFFLINE_READY', ready: true, version: releaseVersion });
  worker.evict('src/core.js');
  worker.disconnect();
  assert.deepEqual(await worker.readiness({ viaPort: false }), { type: 'OFFLINE_READY', ready: false, version: releaseVersion });
});

test('[Node SW simulation] a connected readiness query repairs every missing allowlisted asset with exact bytes', async () => {
  const worker = simulatedWorker({ scope: 'https://sneakernet.test/club/' });
  await worker.dispatch('install');
  const missing = ['styles.css', 'src/launch.js', 'assets/icon-512.png'];
  for (const path of missing) worker.evict(path);
  const beforeRepair = worker.networkCalls.length;
  assert.deepEqual(await worker.readiness(), { type: 'OFFLINE_READY', ready: true, version: releaseVersion });
  const repairCalls = worker.networkCalls.slice(beforeRepair);
  assert.deepEqual(repairCalls.map(call => call.url).sort(), missing.map(path => new URL(path, worker.scope).href).sort());
  assert.ok(repairCalls.every(call => call.cache === 'reload'));
  worker.disconnect();
  const afterRepair = worker.networkCalls.length;
  for (const path of missing) {
    const result = await worker.request(path);
    await assertBytes(result.response, fileBytes.get(path), path);
  }
  assert.equal(worker.networkCalls.length, afterRepair, 'repaired assets work without the simulated network');
});

test('[Node SW simulation] a failed repair cannot claim readiness or leave a partially repaired batch', async () => {
  const worker = simulatedWorker();
  await worker.dispatch('install');
  worker.evict('styles.css');
  worker.evict('src/core.js');
  worker.hideResource('src/core.js');
  assert.deepEqual(await worker.readiness(), { type: 'OFFLINE_READY', ready: false, version: releaseVersion });
  const cache = worker.cacheStores.get(worker.cacheName);
  assert.equal(cache.has(new URL('styles.css', worker.scope).href), false);
  assert.equal(cache.has(new URL('src/core.js', worker.scope).href), false);
  assert.equal(cache.size, releaseFiles.length - 2);
});

test('[Node SW simulation] successful missing-asset and shell fetches repair canonical cache entries', async () => {
  for (const [file, path, options] of [
    ['src/app.js', 'src/app.js?repair=1', {}],
    ['index.html', './?repair=1', { mode: 'navigate' }],
  ]) {
    const worker = simulatedWorker();
    await worker.dispatch('install');
    worker.evict(file);
    const online = await worker.request(path, options);
    await assertBytes(online.response, fileBytes.get(file), `${file}: online repair response`);
    worker.disconnect();
    const afterRepair = worker.networkCalls.length;
    const offline = await worker.request(file);
    await assertBytes(offline.response, fileBytes.get(file), `${file}: offline repaired response`);
    assert.equal(worker.networkCalls.length, afterRepair);
    assert.equal((await worker.readiness()).ready, true);
  }
});

test('[Node SW simulation] an unsuccessful missing-asset fetch is never cached as a valid asset', async () => {
  const worker = simulatedWorker();
  await worker.dispatch('install');
  worker.evict('src/app.js');
  worker.hideResource('src/app.js');
  const result = await worker.request('src/app.js');
  assert.equal(result.response.status, 404);
  assert.equal(worker.cacheStores.get(worker.cacheName).has(new URL('src/app.js', worker.scope).href), false);
  assert.equal((await worker.readiness()).ready, false);
});

test('[Node SW simulation] root and subpath navigation reopen the exact app shell while disconnected', async () => {
  for (const scope of ['https://sneakernet.test/', 'https://sneakernet.test/club/']) {
    const worker = simulatedWorker({ scope });
    await worker.dispatch('install');
    worker.disconnect();
    const fetchesAtDisconnect = worker.networkCalls.length;
    for (const path of ['./', 'index.html', './?return=1', 'index.html?return=1']) {
      const result = await worker.request(path, { mode: 'navigate' });
      assert.equal(result.intercepted, true, `${scope}${path}`);
      await assertBytes(result.response, fileBytes.get('index.html'), `${scope}${path}`);
    }
    assert.equal(worker.networkCalls.length, fetchesAtDisconnect, 'offline shell requests do not reach simulated network');
  }
});

test('[Node SW simulation] every cached module, CSS, icon, and manifest returns actual bytes offline', async () => {
  const worker = simulatedWorker({ scope: 'https://sneakernet.test/club/' });
  await worker.dispatch('install');
  worker.disconnect();
  const fetchesAtDisconnect = worker.networkCalls.length;
  for (const path of releaseFiles) {
    const result = await worker.request(path);
    assert.equal(result.intercepted, true, path);
    await assertBytes(result.response, fileBytes.get(path), path);
  }
  const queried = await worker.request('styles.css?from=bookmark');
  await assertBytes(queried.response, fileBytes.get('styles.css'), 'CSS query variant');
  assert.equal(worker.networkCalls.length, fetchesAtDisconnect);
});

test('[Node SW simulation] unrelated URLs and user mail are neither intercepted nor cached', async () => {
  const worker = simulatedWorker({ scope: 'https://sneakernet.test/club/' });
  await worker.dispatch('install');
  const cache = worker.cacheStores.get(worker.cacheName);
  const before = [...cache.keys()];
  const networkBefore = worker.networkCalls.length;
  worker.disconnect();
  for (const [path, options] of [
    ['sneakernet-mailbag-private.json', {}],
    ['sneakernet-desk-private.json', {}],
    ['sneakernet-private-drafts.json', {}],
    ['local-preferences.json', {}],
    ['docs/OFFLINE.md', {}],
    ['unknown-page/', { mode: 'navigate' }],
    ['https://sneakernet.test/another-club/index.html', { mode: 'navigate' }],
    ['https://other-origin.test/club/index.html', { mode: 'navigate' }],
    ['src/app.js', { method: 'POST' }],
  ]) {
    const result = await worker.request(path, options);
    assert.equal(result.intercepted, false, path);
    assert.equal(result.response, undefined);
  }
  assert.deepEqual([...cache.keys()], before);
  assert.equal(worker.networkCalls.length, networkBefore);
  assert.ok([...cache.keys()].every(url => !url.includes('mailbag') && !url.includes('desk-private')));
});

test('[Node SW simulation] eviction cannot produce a false successful offline resource response', async () => {
  const worker = simulatedWorker();
  await worker.dispatch('install');
  worker.evict('src/app.js');
  worker.disconnect();
  assert.equal((await worker.readiness()).ready, false);
  await assert.rejects(() => worker.request('src/app.js'), /Simulated network disconnected/);
  assert.equal((await worker.readiness()).ready, false);
});
