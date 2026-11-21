import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT, LIMITS, newDesk, validateDesk, createMessage, groupThreads,
  createDeskIndex, readingFacts, recordReading, markMessagesRead, prepareMailbag,
  serializeMailbag, previewMailbag, acceptMailbag, serializeBackup, parseBackup,
  rebuildMailbag, deskCapacity,
} from '../src/core.js';
import {makeLargeDesk} from './fixtures/large-desks.mjs';

const copy = value => structuredClone(value);
const json = value => JSON.stringify(value);
const station = handle => { const desk = newDesk(); desk.station.handle = handle; return desk; };
const post = (desk, body, parentId = null) => createMessage(desk, {body, parentId});
const pack = desk => prepareMailbag(desk, groupThreads(desk).map(thread => thread.id));
async function incomingThread(count = 27) {
  const first = post(station('Sender'), 'A longer conversation about an encoder');
  let source = first.desk;
  for (let i = 1; i < count; i++) source = post(source, `Reply ${i}`, first.message.id).desk;
  const bag = pack(source).bag;
  const desk = (await acceptMailbag(station('Reader'), bag)).desk;
  return {desk, bag, rootId: first.message.id};
}

test('schema-3 migration preserves the complete desk and exact outbox while starting with no reading positions', async () => {
  const {desk: received} = await incomingThread(3);
  const packed = pack(received), current = packed.desk;
  current.drafts.post = 'Private unfinished thought';
  current.local.bookmarkedThreadIds = [groupThreads(current)[0].id];
  current.local.readMessageIds = [current.messages[1].id];
  const old = copy(current); old.schemaVersion = 3; delete old.local.readingPositions;
  const original = json(old), migrated = validateDesk(old);
  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.local.readingPositions, []);
  const stripped = copy(migrated); stripped.schemaVersion = 3; delete stripped.local.readingPositions;
  assert.deepEqual(stripped, old);
  const legacyBackup = {format: BACKUP_FORMAT, version: 3, exportedAt: '2026-11-21T12:00:00.000Z', desk: old};
  assert.deepEqual(parseBackup(json(legacyBackup)), migrated);
  assert.equal(serializeMailbag(rebuildMailbag(migrated, packed.bag.id)), serializeMailbag(packed.bag));
  assert.equal(json(old), original);
  const hidden = copy(old); hidden.local.readingPositions = [];
  assert.throws(() => validateDesk(hidden), /unsupported field \(readingPositions\)/);
});

test('reading a section marks only its exposed postcards and records an independent resume anchor', async () => {
  const {desk} = await incomingThread();
  const index = createDeskIndex(desk), thread = index.threads[0], messages = thread.messages;
  const original = json(desk);
  assert.deepEqual(readingFacts(desk, thread, index), {firstUnreadId: messages[0].id, resumeId: null, unreadCount: 27});
  const first = recordReading(desk, {messageIds: messages.slice(0, 12).map(message => message.id), anchorId: messages[7].id});
  assert.deepEqual(first.local.readMessageIds, messages.slice(0, 12).map(message => message.id));
  assert.deepEqual(first.local.readingPositions, [messages[7].id]);
  assert.deepEqual(readingFacts(first, groupThreads(first)[0]), {firstUnreadId: messages[12].id, resumeId: messages[7].id, unreadCount: 15});
  const second = recordReading(first, {messageIds: messages.slice(12, 24).map(message => message.id), anchorId: messages[15].id});
  assert.deepEqual(second.local.readingPositions, [messages[15].id]);
  assert.equal(readingFacts(second, groupThreads(second)[0]).unreadCount, 3);
  const unreadAgain = markMessagesRead(second, [messages[15].id], false);
  assert.equal(readingFacts(unreadAgain, groupThreads(unreadAgain)[0]).firstUnreadId, messages[15].id);
  assert.deepEqual(unreadAgain.local.readingPositions, [messages[15].id], 'mark unread must not erase the saved place');
  assert.equal(json(desk), original, 'a reading action returns a detached candidate');
});

test('reading anchors follow stable messages when a new branch moves their display position', () => {
  const root = post(station('Maker'), 'Root');
  const branch = post(root.desk, 'Earlier branch', root.message.id);
  const sibling = post(branch.desk, 'Saved later sibling', root.message.id);
  let desk = recordReading(sibling.desk, {messageIds: [sibling.message.id], anchorId: sibling.message.id});
  const child = post(desk, 'New reply inside earlier branch', branch.message.id);
  desk = markMessagesRead(child.desk, [child.message.id], false);
  const index = createDeskIndex(desk), thread = index.threads[0];
  assert.deepEqual(thread.messages.map(message => message.id), [root.message.id, branch.message.id, child.message.id, sibling.message.id]);
  assert.deepEqual(readingFacts(desk, thread, index), {firstUnreadId: child.message.id, resumeId: sibling.message.id, unreadCount: 1});
  assert.equal(index.readingPositionByThread.get(thread.id), sibling.message.id);
  assert.deepEqual(readingFacts(desk, thread), readingFacts(desk, thread, index));
});

test('joining orphan conversations keeps the most recently visited real message without changing either path', async () => {
  const root = post(station('Origin'), 'Missing root');
  const middle = post(root.desk, 'Missing parent below root', root.message.id);
  const one = post(station('Reader'), 'Reply to missing root', root.message.id);
  const two = post(one.desk, 'Reply to missing middle', middle.message.id);
  let desk = recordReading(two.desk, {messageIds: [one.message.id], anchorId: one.message.id});
  desk = recordReading(desk, {messageIds: [two.message.id], anchorId: two.message.id});
  assert.equal(groupThreads(desk).length, 2);
  assert.deepEqual(desk.local.readingPositions, [one.message.id, two.message.id]);
  const earlierRoutes = copy(desk.routes);
  const joined = (await acceptMailbag(desk, pack(middle.desk).bag)).desk;
  assert.equal(groupThreads(joined).length, 1);
  assert.deepEqual(joined.local.readingPositions, [two.message.id]);
  for (const route of earlierRoutes) assert.deepEqual(joined.routes.find(value => value.messageId === route.messageId), route);
  const index = createDeskIndex(joined);
  assert.equal(readingFacts(joined, index.threads[0], index).resumeId, two.message.id);
  const revisited = recordReading(desk, {messageIds: [one.message.id], anchorId: one.message.id});
  assert.deepEqual(revisited.local.readingPositions, [two.message.id, one.message.id]);
  const opposite = (await acceptMailbag(revisited, pack(middle.desk).bag)).desk;
  assert.deepEqual(opposite.local.readingPositions, [one.message.id], 'last explicit visit wins without a station clock');
});

test('reading rejects missing, repeated, cross-thread, and hidden records without changing the desk', () => {
  const first = post(station('Maker'), 'First conversation');
  const second = post(first.desk, 'Second conversation');
  const desk = second.desk, a = first.message.id, b = second.message.id, missing = `msg_${crypto.randomUUID()}`;
  const original = json(desk);
  for (const action of [
    {messageIds: [], anchorId: a}, {messageIds: [a, a], anchorId: a},
    {messageIds: [a], anchorId: b}, {messageIds: [a, b], anchorId: a},
    {messageIds: [missing], anchorId: missing}, {messageIds: [a, missing], anchorId: a},
    {messageIds: [a], anchorId: 'not-an-id'}, {messageIds: [a], anchorId: a, hidden: true},
  ]) assert.throws(() => recordReading(desk, action));
  for (const value of [null, [missing], [a, a], ['not-an-id'], Array(LIMITS.messages + 1).fill(a)]) {
    const malformed = copy(desk); malformed.local.readingPositions = value;
    assert.throws(() => validateDesk(malformed));
  }
  const hidden = copy(desk); delete hidden.local.readingPositions;
  assert.throws(() => validateDesk(hidden), /missing readingPositions/);
  assert.equal(json(desk), original);
});

test('saved positions stay private, survive backups and replay, and never alter original outbox files', async () => {
  const {desk: incoming, bag} = await incomingThread(4);
  const packed = pack(incoming), thread = groupThreads(packed.desk)[0];
  const desk = recordReading(packed.desk, {messageIds: thread.messages.slice(1, 3).map(message => message.id), anchorId: thread.messages[2].id});
  const backup = serializeBackup(desk), restored = parseBackup(backup);
  assert.equal(JSON.parse(backup).version, 4);
  assert.deepEqual(restored, desk);
  const repeated = await acceptMailbag(restored, bag);
  assert.equal(repeated.desk, restored);
  assert.equal(serializeMailbag(rebuildMailbag(restored, packed.bag.id)), serializeMailbag(packed.bag));
  const outgoing = pack(restored).bag, publicText = serializeMailbag(outgoing);
  for (const field of ['readingPositions', 'readMessageIds', 'drafts', 'local']) assert.equal(publicText.includes(`"${field}"`), false);
  await assert.rejects(() => previewMailbag(station('Receiver'), json({...outgoing, readingPositions: desk.local.readingPositions})), /unsupported field \(readingPositions\)/);
});

test('reading facts are pure and reject another snapshot index', async () => {
  const {desk} = await incomingThread(2);
  const index = createDeskIndex(desk), before = json(desk);
  const oldFacts = readingFacts(desk, index.threads[0], index);
  assert.deepEqual(oldFacts, readingFacts(desk, index.threads[0]));
  assert.equal(json(desk), before);
  const next = recordReading(desk, {messageIds: [index.threads[0].messages[0].id], anchorId: index.threads[0].messages[0].id});
  assert.throws(() => readingFacts(next, groupThreads(next)[0], index), /earlier desk/);
  assert.equal(readingFacts(next, groupThreads(next)[0]).unreadCount, 1);
  assert.equal(oldFacts.unreadCount, 2);
});

test('reading-position bytes obey the same full-backup bound atomically', () => {
  const raw = makeLargeDesk({messages: LIMITS.messages, perThread: 1, paths: 1, steps: 1, receipts: 0});
  for (const message of raw.messages) message.body = '界'.repeat(LIMITS.body);
  const desk = validateDesk(raw), anchorId = desk.messages[0].id;
  desk.local.lastBackupAt = '2000-01-01T00:00:00.000Z';
  assert.ok(desk.local.readMessageIds.includes(anchorId), 'this action only needs room for its anchor');
  // Fill legal drafts to exactly 20 bytes below the guarded backup boundary.
  // Calculate UTF-8 entry costs without serializing the growing desk each time.
  let remaining = LIMITS.backupBytes - 20 - deskCapacity(desk).backupBytes;
  let entries = 0;
  for (const message of desk.messages) {
    const overhead = new TextEncoder().encode(json({[message.id]: ''})).byteLength - 2 + Number(entries > 0);
    if (remaining < overhead) break;
    const contentBytes = Math.min(LIMITS.body * 3, remaining - overhead);
    const remainder = contentBytes % 3;
    desk.drafts.replies[message.id] = '界'.repeat(Math.floor(contentBytes / 3)) + (remainder === 1 ? 'x' : remainder === 2 ? 'é' : '');
    remaining -= overhead + contentBytes;
    entries++;
    if (!remaining) break;
  }
  assert.equal(remaining, 0);
  const checked = validateDesk(desk), before = json(checked);
  assert.equal(deskCapacity(checked).backupBytes, LIMITS.backupBytes - 20);
  assert.throws(() => recordReading(checked, {messageIds: [anchorId], anchorId}), /20 MiB full-backup limit/);
  assert.equal(json(checked), before, 'a failed read-position save keeps the original complete desk');
  const roomy = copy(checked); roomy.drafts.post = '';
  const read = recordReading(roomy, {messageIds: [anchorId], anchorId});
  assert.equal(deskCapacity(read).backupBytes - deskCapacity(roomy).backupBytes, anchorId.length + 2);
  assert.equal(new TextEncoder().encode(serializeBackup(read)).byteLength, deskCapacity(read).backupBytes);
});
