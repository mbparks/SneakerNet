import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, newDesk, validateDesk, createMessage, groupThreads, createDeskIndex,
  threadFacts, packingFacts, deskCapacity, markBackupStarted, serializeBackup,
  parseBackup, prepareMailbag, acceptMailbag,
} from '../src/core.js';
import {makeLargeDesk} from './fixtures/large-desks.mjs';

const station = handle => { const desk = newDesk(); desk.station.handle = handle; return desk; };
const allFacts = desk => {
  const index = createDeskIndex(desk);
  for (const thread of index.threads) {
    assert.deepEqual(threadFacts(desk, thread, index), threadFacts(desk, thread));
    assert.deepEqual(packingFacts(desk, thread, index), packingFacts(desk, thread));
  }
  return index;
};

test('one reusable index preserves every reading and packing fact on a full 2,000-message tray', () => {
  const desk = validateDesk(makeLargeDesk({messages: 2000, perThread: 1, paths: 1, steps: 6, receipts: 100}));
  const before = JSON.stringify(desk), index = allFacts(desk);
  assert.equal(index.threads.length, LIMITS.messages);
  for (const thread of index.threads) {
    assert.equal(index.threadById.get(thread.id), thread);
    for (const message of thread.messages) {
      assert.equal(index.messageToThread.get(message.id), thread);
      assert.equal(index.messagesById.get(message.id), message);
      assert.equal(index.routesByMessage.get(message.id).length, 1);
      assert.equal(index.searchTextByThread.get(thread.id).some(text => text.includes('rotary encoder')), true);
    }
  }
  assert.equal(JSON.stringify(desk), before, 'derived lookups never enter the private desk or public records');
});

test('indexed facts follow orphan regrouping and the last appended receipt even with backwards clocks', async () => {
  const root = createMessage(station('Root'), {body: 'Root postcard'});
  let desk = createMessage(station('Early reply'), {body: 'Reply before parent', parentId: root.message.id}).desk;
  let index = allFacts(desk);
  assert.equal(index.messageToThread.get(root.message.id).missingParentId, root.message.id);
  const old = prepareMailbag(desk, index.threads.map(thread => thread.id)); desk = old.desk;
  const arriving = prepareMailbag(root.desk, [root.message.id]);
  desk = (await acceptMailbag(desk, arriving.bag)).desk;
  index = allFacts(desk);
  assert.equal(index.threads.length, 1);
  assert.equal(index.threads[0].root.id, root.message.id);
  assert.equal(packingFacts(desk, index.threads[0], index).lastBagId, old.bag.id);
  assert.equal(packingFacts(desk, index.threads[0], index).newMessageCount, 1);
  const newest = prepareMailbag(desk, [root.message.id]); desk = newest.desk;
  const firstReceipt = desk.local.outbox[0], lastReceipt = desk.local.outbox[1];
  // Field comparison should follow append order; no clock-based sorting in a view.
  firstReceipt.packedAt = '2099-01-01T00:00:00.000Z';
  lastReceipt.packedAt = '1999-01-01T00:00:00.000Z';
  for (const receipt of [firstReceipt, lastReceipt]) {
    const ids = new Set(receipt.pathHeads.map(head => head.markId));
    for (const route of desk.routes) for (const mark of route.path) if (ids.has(mark.id)) mark.at = receipt.packedAt;
  }
  desk = validateDesk(desk);
  index = allFacts(desk);
  assert.equal(packingFacts(desk, index.threads[0], index).lastBagId, newest.bag.id);
});

test('snapshot indexes reject a different desk and do not leak edits through a global cache', () => {
  const desk = createMessage(station('Maker'), {body: 'Before'}).desk;
  const before = createDeskIndex(desk), replacement = validateDesk(desk);
  assert.throws(() => threadFacts(replacement, before.threads[0], before), /earlier desk/);
  assert.throws(() => packingFacts(replacement, before.threads[0], before), /earlier desk/);
  desk.drafts.post = 'Private'; desk.local.bookmarkedThreadIds.push(desk.messages[0].id);
  const after = createDeskIndex(desk);
  assert.equal(threadFacts(desk, after.threads[0], after).isBookmarked, true);
  assert.equal(before.bookmarked.size, 0, 'the first index holds its own private membership sets');
});

test('search preserves postcard boundaries and case folding without including private text', () => {
  let desk = createMessage(station('Handle'), {body: 'Rotor'}).desk;
  const parentId = desk.messages[0].id;
  desk = createMessage(desk, {parentId, body: 'ENCODER'}).desk;
  desk.drafts.post = 'UNPUBLISHED SECRET';
  const index = createDeskIndex(desk), texts = index.searchTextByThread.get(parentId);
  assert.equal(texts.some(text => text.includes('encoder handle')), true);
  assert.equal(texts.some(text => text.includes('handle encoder')), false, 'words cannot run across cards');
  assert.equal(texts.some(text => text.includes('unpublished secret')), false);
});

test('capacity counts the exact reserved UTF-8 backup and leaves drafts and last-backup time untouched', () => {
  const desk = validateDesk(makeLargeDesk({messages: 12, paths: 2, steps: 8, receipts: 3}));
  desk.drafts.post = 'Private é — 📮';
  const before = JSON.stringify(desk), counts = deskCapacity(desk);
  assert.deepEqual({...counts, backupBytes: 0}, {messages: 12, routes: 24, totalSteps: 192,
    longestPath: 8, receivedBags: 0, backupBytes: 0, arrivals: 0, outbox: 3});
  const reserved = markBackupStarted(desk, '2000-01-01T00:00:00.000Z');
  assert.equal(counts.backupBytes, new TextEncoder().encode(serializeBackup(reserved)).byteLength);
  assert.equal(JSON.stringify(desk), before);
  assert.deepEqual(parseBackup(serializeBackup(desk)), desk);
});

test('all public count limits can be inspected at their boundary without truncating a path', () => {
  const desk = validateDesk(makeLargeDesk({messages: 2000, perThread: 2, paths: 2, steps: 5, receipts: 100}));
  const counts = deskCapacity(desk);
  assert.equal(counts.messages, LIMITS.messages);
  assert.equal(counts.routes, LIMITS.routes);
  assert.equal(counts.totalSteps, LIMITS.totalSteps);
  assert.equal(createDeskIndex(desk).threads.length, 1000);
  const tooMany = structuredClone(desk);
  tooMany.routes[0].path.push({...tooMany.routes[0].path.at(-1), id: `mark_${crypto.randomUUID()}`});
  assert.throws(() => validateDesk(tooMany), /20,000/);
  assert.equal(desk.routes[0].path.length, 5);
  const long = validateDesk(makeLargeDesk({messages: 1, paths: 1, steps: LIMITS.stepsPerRoute, receipts: 1}));
  assert.equal(deskCapacity(long).longestPath, LIMITS.stepsPerRoute);
  const before = JSON.stringify(long);
  assert.throws(() => prepareMailbag(long, groupThreads(long).map(thread => thread.id)), /512/);
  assert.equal(JSON.stringify(long), before, 'a full path cannot lose old marks to make another packing fit');
});
