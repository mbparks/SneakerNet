import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, newDesk, validateDesk, createMessage, groupThreads, prepareMailbag,
  rebuildMailbag, packingFacts, serializeMailbag, previewMailbag, acceptMailbag,
  serializeBackup, parseBackup, markMessagesRead, setThreadFlag, markBackupStarted,
} from '../src/core.js';

const copy = value => structuredClone(value);
const json = value => JSON.stringify(value);
function station(handle, postmark = '') {
  const desk = newDesk(); desk.station.handle = handle; desk.station.postmark = postmark; return desk;
}
function post(desk, body, parentId = null) { return createMessage(desk, {body, parentId}); }
function pack(desk, threadIds = groupThreads(desk).map(thread => thread.id)) { return prepareMailbag(desk, threadIds); }
async function deliver(desk, bag) {
  const preview = await previewMailbag(desk, serializeMailbag(bag));
  return acceptMailbag(desk, preview.bag);
}
function oldDesk(desk, version) {
  const value = copy(desk); value.schemaVersion = version;
  if (version === 1) delete value.local;
  else { delete value.local.outbox; delete value.local.readingPositions; }
  return value;
}
function atTime(at, action) {
  const NativeDate = globalThis.Date;
  try {
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [at])); }
    };
    return action();
  } finally { globalThis.Date = NativeDate; }
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}
function bulkDesk(count) {
  const desk = station('Bulk maker', 'Club table');
  for (let i = 0; i < count; i++) {
    const at = '2026-11-21T12:00:00.000Z', id = `msg_${crypto.randomUUID()}`;
    desk.messages.push({id, parentId: null, handle: desk.station.handle, body: `Card ${i}`, createdAt: at});
    desk.routes.push({messageId: id, path: [{id: `mark_${crypto.randomUUID()}`, stationId: desk.station.id,
      handle: desk.station.handle, postmark: desk.station.postmark, kind: 'written', at}]});
    desk.local.readMessageIds.push(id);
  }
  return desk;
}

test('schema-2 desks and backups migrate all existing private notes with an empty outbox', async () => {
  const source = pack(post(station('A', 'Cumberland'), 'Existing public card').desk);
  let desk = (await deliver(station('B', 'Hamfest'), source.bag)).desk;
  desk = pack(desk).desk;
  desk = markMessagesRead(desk, desk.messages.map(message => message.id));
  for (const flag of ['bookmarked', 'archived', 'followed']) desk = setThreadFlag(desk, desk.messages[0].id, flag, true);
  desk = markBackupStarted(desk, '2026-11-21T15:00:00.000Z');
  desk.drafts.post = 'A private saved draft';
  desk.drafts.replies[desk.messages[0].id] = 'A private saved reply';
  desk.selected = [desk.messages[0].id]; desk.preferences.theme = 'night';
  const old = oldDesk(desk, 2), before = json(old);
  const migrated = validateDesk(old);
  assert.equal(migrated.schemaVersion, 4);
  for (const key of Object.keys(old).filter(key => key !== 'schemaVersion' && key !== 'local')) assert.deepEqual(migrated[key], old[key], key);
  for (const key of Object.keys(old.local)) assert.deepEqual(migrated.local[key], old.local[key], key);
  assert.deepEqual(migrated.local.outbox, [], 'old packed postmarks do not invent old envelope IDs');
  const backup = {format: 'sneakernet-social-club/desk', version: 2, exportedAt: '2026-11-21T16:00:00.000Z', desk: old};
  assert.deepEqual(parseBackup(json(backup)), migrated);
  assert.equal(json(old), before);
  const schema1 = validateDesk(oldDesk(desk, 1));
  assert.deepEqual(schema1.local.outbox, []);
  assert.deepEqual(schema1.local.readMessageIds, desk.messages.map(message => message.id));
  const hidden = copy(old); hidden.local.outbox = [];
  assert.throws(() => validateDesk(hidden), /unsupported field \(outbox\)/);
});

test('packing preview creates a detached reference receipt only in the candidate desk', () => {
  const written = post(station('A', 'Cumberland'), 'A public postcard');
  const before = json(written.desk), prepared = pack(written.desk);
  assert.equal(json(written.desk), before);
  assert.deepEqual(written.desk.local.outbox, []);
  assert.equal(prepared.desk.local.outbox.length, 1);
  const receipt = prepared.desk.local.outbox[0];
  assert.deepEqual(Object.keys(receipt).sort(), ['bagId', 'messageIds', 'packedAt', 'pathHeads']);
  assert.equal(receipt.bagId, prepared.bag.id);
  assert.equal(receipt.packedAt, prepared.bag.packedAt);
  assert.deepEqual(receipt.messageIds, prepared.bag.messages.map(message => message.id));
  assert.deepEqual(receipt.pathHeads, prepared.bag.routes.map(route => ({messageId: route.messageId, markId: route.path.at(-1).id})));
  receipt.messageIds.length = 0;
  assert.equal(prepared.bag.messages.length, 1, 'the receipt does not alias the public envelope');
});

test('same-bag rebuild remains byte-exact after new replies, route extension, station edits, and reordered backup keys', async () => {
  let A = post(station('A', 'Cumberland'), 'Who has an encoder?').desk;
  const rootId = A.messages[0].id;
  const initial = pack(A); A = initial.desk;
  const originalText = serializeMailbag(initial.bag);
  assert.equal(serializeMailbag(reverseKeys(initial.bag)), originalText, 'object-key order cannot alter an exported file');
  let B = (await deliver(station('B', 'DEF CON'), initial.bag)).desk;
  B = post(B, 'I have one.', rootId).desk;
  const returning = pack(B); B = returning.desk;
  A = (await deliver(A, returning.bag)).desk;
  A = post(A, 'Thank you!', rootId).desk;
  A = pack(A).desk;
  A.station.handle = 'A-now'; A.station.postmark = 'Another club night';
  const before = json(A);
  const rebuilt = rebuildMailbag(A, initial.bag.id);
  assert.equal(serializeMailbag(rebuilt), originalText);
  assert.equal(rebuilt.messages.length, 1);
  assert.equal(rebuilt.routes[0].path.length, 2, 'the old copy stops at its original packed stamp');
  assert.equal(rebuilt.routes[0].path.at(-1).postmark, 'Cumberland');
  assert.equal(json(A), before, 'opening/rebuilding a receipt adds no path or private record');
  const backupText = serializeBackup(reverseKeys(A));
  assert.equal(JSON.parse(backupText).version, 4);
  const restored = parseBackup(backupText);
  assert.equal(serializeMailbag(rebuildMailbag(restored, initial.bag.id)), originalText);
  const replay = await deliver(B, rebuilt);
  assert.equal(replay.desk, B, 'a second copy of the same bag is still an import no-op');
  assert.equal(replay.summary.newPaths, 0);
});

test('a branching return preserves old exact packed prefixes without adding later branches to an old bag', async () => {
  let A = post(station('A'), 'Travelling postcard').desk;
  const first = pack(A); A = first.desk;
  let B = (await deliver(station('B'), first.bag)).desk;
  let C = (await deliver(station('C'), first.bag)).desk;
  A = (await deliver(A, pack(B).bag)).desk;
  A = (await deliver(A, pack(C).bag)).desk;
  assert.equal(A.routes.length, 2);
  const before = json(A);
  const rebuilt = rebuildMailbag(A, first.bag.id);
  assert.equal(serializeMailbag(rebuilt), serializeMailbag(first.bag));
  assert.equal(rebuilt.routes.length, 1);
  assert.equal(json(A), before);
  const current = pack(A);
  assert.equal(current.bag.routes.length, 2);
  assert.equal(serializeMailbag(rebuildMailbag(current.desk, current.bag.id)), serializeMailbag(current.bag));
});

test('packing facts distinguish no receipt, unchanged mail, private edits, new replies, and extended paths', async () => {
  let desk = post(station('A'), 'Root postcard').desk;
  let thread = groupThreads(desk)[0];
  assert.deepEqual(packingFacts(desk, thread), {lastBagId: null, lastPackedAt: null, hasReceipt: false, newMessageCount: 1, newPathCount: 1, hasChanges: true});
  const initial = pack(desk); desk = initial.desk;
  thread = groupThreads(desk)[0];
  assert.deepEqual(packingFacts(desk, thread), {lastBagId: initial.bag.id, lastPackedAt: initial.bag.packedAt, hasReceipt: true, newMessageCount: 0, newPathCount: 0, hasChanges: false});
  desk.drafts.post = 'Private'; desk.preferences.theme = 'contrast';
  desk = setThreadFlag(desk, thread.id, 'archived', true);
  assert.equal(packingFacts(desk, groupThreads(desk)[0]).hasChanges, false);
  desk = post(desk, 'New local reply', thread.id).desk;
  assert.equal(packingFacts(desk, groupThreads(desk)[0]).newMessageCount, 1);
  assert.equal(packingFacts(desk, groupThreads(desk)[0]).newPathCount, 1);
  const second = pack(desk); desk = second.desk;
  assert.equal(packingFacts(desk, groupThreads(desk)[0]).hasChanges, false);
  let carrier = (await deliver(station('B'), second.bag)).desk;
  desk = (await deliver(desk, pack(carrier).bag)).desk;
  const facts = packingFacts(desk, groupThreads(desk)[0]);
  assert.equal(facts.newMessageCount, 0);
  assert.equal(facts.newPathCount, 2, 'each returned path extends beyond its last packed head');
  assert.equal(facts.hasChanges, true);
});

test('last packing follows append order, ignores newer unrelated bags, and tolerates backwards station clocks', () => {
  let desk = post(station('A'), 'First thread').desk;
  const firstId = desk.messages[0].id;
  desk = post(desk, 'Second thread').desk;
  const secondId = desk.messages[1].id;
  const earlier = atTime('2099-01-01T00:00:00.000Z', () => pack(desk, [firstId])); desk = earlier.desk;
  const unrelated = pack(desk, [secondId]); desk = unrelated.desk;
  assert.equal(packingFacts(desk, groupThreads(desk).find(thread => thread.id === firstId)).lastBagId, earlier.bag.id);
  const later = atTime('1999-01-01T00:00:00.000Z', () => pack(desk, [firstId])); desk = later.desk;
  const facts = packingFacts(desk, groupThreads(desk).find(thread => thread.id === firstId));
  assert.equal(facts.lastBagId, later.bag.id);
  assert.ok(facts.lastPackedAt < earlier.bag.packedAt);
  assert.equal(facts.hasChanges, false);
  assert.deepEqual(desk.local.outbox.map(receipt => receipt.bagId), [earlier.bag.id, unrelated.bag.id, later.bag.id]);
});

test('early-reply receipts stay exact as ancestors arrive and the current thread regroups', async () => {
  const original = post(station('A'), 'Root');
  const middle = post(station('B'), 'Middle', original.message.id);
  let desk = post(station('C'), 'Leaf', middle.message.id).desk;
  const leafBag = pack(desk); desk = leafBag.desk;
  assert.equal(groupThreads(desk)[0].id, middle.message.id);
  desk = (await deliver(desk, pack(middle.desk).bag)).desk;
  assert.equal(groupThreads(desk)[0].id, original.message.id);
  let facts = packingFacts(desk, groupThreads(desk)[0]);
  assert.equal(facts.lastBagId, leafBag.bag.id);
  assert.equal(facts.newMessageCount, 1);
  assert.equal(facts.newPathCount, 1);
  desk = (await deliver(desk, pack(original.desk).bag)).desk;
  facts = packingFacts(desk, groupThreads(desk)[0]);
  assert.equal(facts.newMessageCount, 2);
  assert.equal(facts.newPathCount, 2);
  assert.equal(serializeMailbag(rebuildMailbag(desk, leafBag.bag.id)), serializeMailbag(leafBag.bag));
});

test('outbox retains at most 100 receipts without losing old public stamps or messages', () => {
  let desk = post(station('A'), 'One card, several packings').desk;
  const first = pack(desk); desk = first.desk;
  for (let i = 1; i < 103; i++) desk = pack(desk).desk;
  assert.equal(desk.local.outbox.length, LIMITS.outbox);
  assert.equal(desk.messages.length, 1);
  assert.equal(desk.routes.length, 1);
  assert.equal(desk.routes[0].path.length, 104);
  assert.equal(desk.routes[0].path.some(mark => mark.id === first.bag.routes[0].path.at(-1).id), true);
  assert.equal(desk.local.outbox.some(receipt => receipt.bagId === first.bag.id), false);
  assert.throws(() => rebuildMailbag(desk, first.bag.id), /may have aged out/);
  assert.equal(packingFacts(desk, groupThreads(desk)[0]).hasChanges, false);
});

test('outbox reference budget trims whole receipts and every retained envelope still rebuilds exactly', () => {
  let desk = bulkDesk(1000);
  const packed = [];
  for (let i = 0; i < 7; i++) {
    const next = pack(desk); desk = next.desk;
    packed.push({bagId: next.bag.id, text: serializeMailbag(next.bag)});
  }
  const references = desk.local.outbox.reduce((total, receipt) => total + receipt.messageIds.length + 2 * receipt.pathHeads.length, 0);
  assert.ok(references <= LIMITS.outboxReferences);
  assert.equal(desk.local.outbox.length, 6);
  assert.equal(desk.local.outbox.some(receipt => receipt.bagId === packed[0].bagId), false);
  assert.equal(desk.messages.length, 1000);
  assert.equal(desk.routes.length, 1000);
  assert.equal(desk.routes[0].path.length, 8);
  for (const receipt of desk.local.outbox) {
    const expected = packed.find(item => item.bagId === receipt.bagId).text;
    assert.equal(serializeMailbag(rebuildMailbag(desk, receipt.bagId)), expected);
  }
});

test('outbox is private, included in full backups, and never accepted from a public envelope', async () => {
  let desk = post(station('A'), 'Public card').desk;
  desk.drafts.post = 'PRIVATE SECRET';
  const packed = pack(desk); desk = packed.desk;
  const text = serializeMailbag(packed.bag);
  for (const field of ['outbox', 'pathHeads', 'PRIVATE SECRET', 'local', 'drafts']) assert.equal(text.includes(field), false, field);
  assert.equal(JSON.parse(text).version, 1);
  assert.deepEqual(parseBackup(serializeBackup(desk)), desk);
  const injected = {...copy(packed.bag), outbox: copy(desk.local.outbox)};
  await assert.rejects(() => previewMailbag(station('B'), json(injected)), /unsupported field \(outbox\)/);
});

test('malformed packing references are rejected without changing the working desk', () => {
  let desk = post(station('A'), 'One').desk;
  desk = post(desk, 'Two').desk;
  desk = pack(desk).desk;
  const before = json(desk);
  const changed = mutate => { const value = copy(desk); mutate(value, value.local.outbox[0]); return value; };
  const cases = [
    changed(value => { delete value.local.outbox; }),
    changed((value, receipt) => { receipt.extra = 'hidden'; }),
    changed((value, receipt) => { value.local.outbox.push(copy(receipt)); }),
    changed((value, receipt) => { value.local.outbox.push({...copy(receipt), bagId: `bag_${crypto.randomUUID()}`}); }),
    changed((value, receipt) => { receipt.messageIds.push(receipt.messageIds[0]); }),
    changed((value, receipt) => { receipt.messageIds.reverse(); }),
    changed((value, receipt) => { receipt.messageIds[0] = `msg_${crypto.randomUUID()}`; }),
    changed((value, receipt) => { receipt.pathHeads.reverse(); }),
    changed((value, receipt) => { receipt.pathHeads.push(copy(receipt.pathHeads[0])); }),
    changed((value, receipt) => { receipt.pathHeads.pop(); }),
    changed((value, receipt) => { receipt.pathHeads[0].markId = value.routes[0].path[0].id; }),
    changed((value, receipt) => { receipt.pathHeads[0].messageId = receipt.messageIds.at(-1); }),
    changed((value, receipt) => { receipt.packedAt = '2001-01-01T00:00:00.000Z'; }),
    changed((value, receipt) => { receipt.bagId = 'not-a-bag'; }),
  ];
  for (const candidate of cases) {
    assert.throws(() => validateDesk(candidate));
    const backup = {format: 'sneakernet-social-club/desk', version: 4, exportedAt: '2026-11-21T12:00:00.000Z', desk: candidate};
    assert.throws(() => parseBackup(json(backup)));
    assert.equal(json(desk), before);
  }
  const one = post(station('A'), 'Same-clock continuation').desk;
  const first = atTime('2026-11-21T12:00:00.000Z', () => pack(one));
  const second = atTime('2026-11-21T12:00:00.000Z', () => pack(first.desk));
  const prefix = copy(second.desk);
  prefix.local.outbox[1].pathHeads.unshift(copy(prefix.local.outbox[0].pathHeads[0]));
  prefix.local.outbox = [prefix.local.outbox[1]];
  assert.throws(() => validateDesk(prefix), /both a path and its continuation/);
});

test('a referenced packed copy must still satisfy its exact import byte cap', () => {
  let desk = pack(bulkDesk(1850)).desk;
  for (const message of desk.messages) message.body = '界'.repeat(2000);
  assert.throws(() => validateDesk(desk), /recorded packed bag exceeds the 5 MiB/);
});
