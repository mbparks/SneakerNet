/**
 * NODE INDEXEDDB TRANSACTION SIMULATION — NOT BROWSER STORAGE ACCEPTANCE.
 *
 * Runs the actual storage module against a small, serialized transaction model.
 * Atomic commit/abort and request events are modeled platform contracts. These
 * checks prove how this module uses those contracts, not browser durability,
 * quota prompts, page termination, or cross-tab scheduling in a real browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDesk, createMessage, prepareMailbag, recordReading } from '../src/core.js';

console.log('Node IndexedDB transaction simulation. NOT browser storage acceptance.');

function transactionModel(initialRecord) {
  let record = structuredClone(initialRecord);
  let pendingFailure;
  let scheduled = false;
  const transactions = [];
  const broadcasts = [];
  const channels = [];
  const stats = { reads: 0, writes: 0, commits: 0, aborts: 0 };

  function advance() {
    if (scheduled || !transactions.length) return;
    scheduled = true;
    queueMicrotask(() => {
      const tx = transactions.shift();
      let staged;
      const request = tx.request;
      tx.store.put = (value, key) => {
        assert.equal(tx.mode, 'readwrite'); assert.equal(key, 'desk');
        stats.writes++;
        staged = structuredClone(value);
        return {};
      };
      request.result = structuredClone(record);
      try { request.onsuccess?.(); }
      catch (error) { tx.error = error; tx.aborted = true; }
      if (!tx.aborted && staged !== undefined && pendingFailure) {
        tx.error = pendingFailure; pendingFailure = undefined; tx.aborted = true;
        tx.onerror?.({ target: tx });
      }
      if (tx.aborted) { stats.aborts++; tx.onabort?.(); }
      else {
        if (staged !== undefined) { record = staged; stats.commits++; }
        tx.oncomplete?.();
      }
      scheduled = false; advance();
    });
  }
  const db = {
    objectStoreNames: { contains: name => name === 'snapshots' },
    close() {},
    transaction(name, mode) {
      assert.equal(name, 'snapshots');
      const tx = {
        mode, request: {}, error: null, aborted: false,
        abort() { this.aborted = true; },
        objectStore(storeName) { assert.equal(storeName, 'snapshots'); return this.store; },
      };
      tx.store = {
        get(key) { assert.equal(key, 'desk'); stats.reads++; return tx.request; },
        put() { throw new Error('put before modeled get succeeded'); },
      };
      transactions.push(tx); advance(); return tx;
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
      return request;
    },
  };
  class BroadcastChannel {
    constructor(name) { this.name = name; channels.push(this); }
    postMessage(message) {
      broadcasts.push(structuredClone(message));
      for (const receiver of channels) if (receiver !== this && receiver.name === this.name) {
        queueMicrotask(() => receiver.onmessage?.({ data: structuredClone(message) }));
      }
    }
    close() {}
  }
  return { indexedDB, BroadcastChannel, broadcasts, stats,
    record: () => structuredClone(record),
    failNextCommit(error) { pendingFailure = error; },
  };
}

async function setup(t, initialRecord) {
  const previous = { indexedDB: globalThis.indexedDB, BroadcastChannel: globalThis.BroadcastChannel };
  const model = transactionModel(initialRecord);
  globalThis.indexedDB = model.indexedDB;
  globalThis.BroadcastChannel = model.BroadcastChannel;
  t.after(() => {
    globalThis.indexedDB = previous.indexedDB;
    globalThis.BroadcastChannel = previous.BroadcastChannel;
  });
  // Each URL yields a fresh actual module and its own connection/channel state.
  const moduleURL = new URL(`../src/storage.js?simulation=${randomUUID()}`, import.meta.url);
  const api = await import(moduleURL.href);
  return { model, api, secondTab: () => import(new URL(`../src/storage.js?simulation=${randomUUID()}`, import.meta.url).href) };
}

function fixtureDesk() {
  const desk = newDesk();
  desk.station.handle = 'Local maker';
  desk.station.postmark = 'Cumberland Maker Meetup';
  desk.preferences.theme = 'night';
  desk.drafts.post = 'Already saved privately.';
  return desk;
}
const draftSet = text => ({ post: text, replies: {} });

test('[Node storage simulation] draft patch changes only drafts, increments revision, and broadcasts after commit', async t => {
  const original = fixtureDesk();
  const { model, api } = await setup(t, { revision: 8, desk: original });
  const drafts = { post: 'New private thought.', replies: { [`msg_${randomUUID()}`]: 'A private reply.' } };
  const expected = structuredClone(drafts);
  const saving = api.saveDrafts(drafts, 8);
  drafts.post = 'Mutation after calling save must not leak into persistence.';
  assert.deepEqual(await saving, { revision: 9 });
  assert.deepEqual(model.record(), { revision: 9, desk: { ...original, drafts: expected } });
  assert.deepEqual(await api.loadDesk(), model.record());
  assert.deepEqual(model.broadcasts, [{ type: 'desk-saved', revision: 9 }]);
});

test('[Node storage simulation] a private draft patch retains packing receipts, reading positions, and all paths', async t => {
  let original = fixtureDesk();
  const posted = createMessage(original, { body: 'Carrier receipt preservation fixture.' });
  original = prepareMailbag(posted.desk, [posted.message.id]).desk;
  original = recordReading(original, {messageIds: [posted.message.id], anchorId: posted.message.id});
  assert.equal(original.local.outbox.length, 1);
  const { model, api } = await setup(t, { revision: 4, desk: original });
  const drafts = draftSet('Still private after recording a public packing.');
  await api.saveDrafts(drafts, 4);
  assert.deepEqual(model.record(), { revision: 5, desk: { ...original, drafts } });
  assert.deepEqual(model.record().desk.local.outbox, original.local.outbox);
  assert.deepEqual(model.record().desk.local.readingPositions, [posted.message.id]);
  assert.deepEqual(model.record().desk.routes, original.routes);
});

test('[Node storage simulation] stale draft cannot overwrite a whole-desk update', async t => {
  const original = fixtureDesk();
  const { model, api } = await setup(t, { revision: 2, desk: original });
  const changed = structuredClone(original); changed.station.postmark = 'New meetup';
  await api.saveDesk(changed, 2);
  await assert.rejects(api.saveDrafts(draftSet('Stale editor'), 2), { code: 'CONFLICT' });
  assert.deepEqual(model.record(), { revision: 3, desk: changed });
  assert.equal(model.broadcasts.length, 1);
});

test('[Node storage simulation] simultaneous patches with the same revision permit exactly one commit', async t => {
  const { model, api, secondTab } = await setup(t, { revision: 4, desk: fixtureDesk() });
  const other = await secondTab();
  const values = await Promise.allSettled([
    api.saveDrafts(draftSet('First editor'), 4),
    other.saveDrafts(draftSet('Second editor'), 4),
  ]);
  assert.equal(values.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(values.find(value => value.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal(model.record().revision, 5);
  assert.ok(['First editor', 'Second editor'].includes(model.record().desk.drafts.post));
  assert.equal(model.stats.commits, 1); assert.equal(model.broadcasts.length, 1);
});

test('[Node storage simulation] quota failure preserves saved mail and allows retry with the same revision', async t => {
  const original = { revision: 5, desk: fixtureDesk() };
  const { model, api } = await setup(t, original);
  model.failNextCommit(new DOMException('Simulated quota full', 'QuotaExceededError'));
  await assert.rejects(api.saveDrafts(draftSet('Unsaved but recoverable'), 5), { code: 'QUOTA' });
  assert.deepEqual(model.record(), original); assert.equal(model.broadcasts.length, 0);
  assert.deepEqual(await api.saveDrafts(draftSet('Unsaved but recoverable'), 5), { revision: 6 });
  assert.equal(model.record().desk.drafts.post, 'Unsaved but recoverable');
  assert.equal(model.broadcasts.length, 1);
});

test('[Node storage simulation] whole-desk update cannot overwrite a successfully patched draft at a stale revision', async t => {
  const original = fixtureDesk();
  const { model, api } = await setup(t, { revision: 1, desk: original });
  await api.saveDrafts(draftSet('Most recent draft'), 1);
  const stale = structuredClone(original); stale.preferences.theme = 'contrast';
  await assert.rejects(api.saveDesk(stale, 1), { code: 'CONFLICT' });
  assert.equal(model.record().desk.drafts.post, 'Most recent draft');
  assert.equal(model.record().desk.preferences.theme, 'night');
  assert.equal(model.record().revision, 2);
});

test('[Node storage simulation] invalid draft shapes, IDs, controls, and lengths never start a write', async t => {
  const original = { revision: 3, desk: fixtureDesk() };
  const { model, api } = await setup(t, original);
  for (const invalid of [
    null, [], { post: '', replies: {}, extra: true }, { post: '', replies: [] },
    { post: 'x'.repeat(2001), replies: {} }, { post: '\u0000', replies: {} },
    { post: '', replies: { arbitrary: 'Wrong parent ID' } },
    { post: '', replies: { [`msg_${randomUUID()}`]: 'x'.repeat(2001) } },
    { post: '', replies: { [`msg_${randomUUID()}`]: 12 } },
  ]) await assert.rejects(api.saveDrafts(invalid, 3), { code: 'INVALID' });
  assert.deepEqual(model.record(), original); assert.equal(model.stats.reads, 0);
  assert.equal(model.stats.writes, 0); assert.equal(model.broadcasts.length, 0);
});

test('[Node storage simulation] draft patch refuses empty, schema-1, schema-2, and schema-3 desks until a full schema-4 save', async t => {
  const { model, api } = await setup(t, undefined);
  await assert.rejects(api.saveDrafts(draftSet('Do not lose this'), 0), { code: 'NOT_READY' });
  assert.equal(model.record(), undefined);
  const legacy = fixtureDesk(); legacy.schemaVersion = 1; delete legacy.local;
  await api.saveDesk(legacy, 0);
  await assert.rejects(api.saveDrafts(draftSet('Do not write into legacy'), 1), { code: 'NOT_READY' });
  assert.deepEqual(model.record(), { revision: 1, desk: legacy });
  const version2 = fixtureDesk(); version2.schemaVersion = 2; delete version2.local.outbox; delete version2.local.readingPositions;
  await api.saveDesk(version2, 1);
  await assert.rejects(api.saveDrafts(draftSet('Wait for outbox migration'), 2), { code: 'NOT_READY' });
  assert.deepEqual(model.record(), { revision: 2, desk: version2 });
  const version3 = fixtureDesk(); version3.schemaVersion = 3; delete version3.local.readingPositions;
  await api.saveDesk(version3, 2);
  await assert.rejects(api.saveDrafts(draftSet('Wait for reading position migration'), 3), { code: 'NOT_READY' });
  assert.deepEqual(model.record(), { revision: 3, desk: version3 });
  const migrated = fixtureDesk();
  await api.saveDesk(migrated, 3);
  await api.saveDrafts(draftSet('Now it is safe'), 4);
  assert.equal(model.record().revision, 5); assert.equal(model.record().desk.drafts.post, 'Now it is safe');
});

test('[Node storage simulation] corrupt storage record cannot be replaced by a draft patch', async t => {
  const corrupt = { revision: 'broken', desk: fixtureDesk() };
  const { model, api } = await setup(t, corrupt);
  await assert.rejects(api.saveDrafts(draftSet('Recovery draft'), 0), { code: 'CORRUPT' });
  assert.deepEqual(model.record(), corrupt); assert.equal(model.stats.writes, 0);
});

test('[Node storage simulation] invalid and exhausted revisions leave storage untouched', async t => {
  const original = { revision: Number.MAX_SAFE_INTEGER, desk: fixtureDesk() };
  const { model, api } = await setup(t, original);
  for (const revision of [-1, 1.5, NaN, undefined, '1']) {
    await assert.rejects(api.saveDrafts(draftSet('Private'), revision), { code: 'REVISION' });
  }
  await assert.rejects(api.saveDrafts(draftSet('Private'), Number.MAX_SAFE_INTEGER), { code: 'REVISION' });
  assert.deepEqual(model.record(), original); assert.equal(model.stats.writes, 0);
});

test('[Node storage simulation] other tabs receive committed draft revision and unsubscribe stops callbacks', async t => {
  const { api, secondTab } = await setup(t, { revision: 6, desk: fixtureDesk() });
  const other = await secondTab();
  const seen = [];
  const unsubscribe = other.subscribeChanges(value => seen.push(value));
  await api.saveDrafts(draftSet('One'), 6);
  await Promise.resolve();
  assert.deepEqual(seen, [{ revision: 7 }]);
  unsubscribe();
  await api.saveDrafts(draftSet('Two'), 7); await Promise.resolve();
  assert.deepEqual(seen, [{ revision: 7 }]);
});

test('[Node storage simulation] a failed full save also preserves the prior snapshot and revision', async t => {
  const original = { revision: 11, desk: fixtureDesk() };
  const { model, api } = await setup(t, original);
  const changed = fixtureDesk(); changed.preferences.theme = 'contrast';
  model.failNextCommit(new DOMException('Simulated storage blocked', 'SecurityError'));
  await assert.rejects(api.saveDesk(changed, 11), { code: 'BLOCKED' });
  assert.deepEqual(model.record(), original); assert.equal(model.broadcasts.length, 0);
  assert.deepEqual(await api.saveDesk(changed, 11), { revision: 12 });
});
