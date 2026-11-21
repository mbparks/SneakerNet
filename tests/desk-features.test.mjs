import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesk, validateDesk, validateDrafts, createMessage, groupThreads,
  prepareMailbag, serializeMailbag, previewMailbag, acceptMailbag,
  serializeBackup, makeBackup, parseBackup, markMessagesRead, setThreadFlag,
  threadFacts, markBackupStarted, LIMITS,
} from '../src/core.js';

const copy = value => structuredClone(value);
const json = value => JSON.stringify(value);
function station(handle, postmark = '') {
  const desk = newDesk(); desk.station.handle = handle; desk.station.postmark = postmark; return desk;
}
function post(desk, body, parentId = null) { return createMessage(desk, {body, parentId}); }
function pack(desk) { return prepareMailbag(desk, groupThreads(desk).map(thread => thread.id)); }
async function deliver(desk, bag) {
  const preview = await previewMailbag(desk, serializeMailbag(bag));
  return acceptMailbag(desk, preview.bag);
}
function legacy(desk) {
  const value = copy(desk); delete value.local; value.schemaVersion = 1; return value;
}

test('a fresh schema-4 desk has exactly the private local contract and no sample history', () => {
  const desk = newDesk();
  assert.equal(desk.schemaVersion, 4);
  assert.deepEqual(desk.local, {
    readMessageIds: [], bookmarkedThreadIds: [], archivedThreadIds: [], followedThreadIds: [], lastBackupAt: null, arrivals: [], outbox: [], readingPositions: [],
  });
  assert.deepEqual(desk.messages, []);
  assert.deepEqual(validateDesk(desk), desk);
});

test('schema-1 migration preserves every legacy value and marks existing mail read', async () => {
  const sender = post(station('Sender', 'Cumberland'), 'Old public card').desk;
  const bag = pack(sender).bag;
  let receiver = (await deliver(station('Reader', 'Workshop'), bag)).desk;
  receiver = post(receiver, 'Old reply', sender.messages[0].id).desk;
  receiver.selected = [sender.messages[0].id];
  receiver.drafts.post = 'A private old draft';
  receiver.drafts.replies[sender.messages[0].id] = 'An old reply draft';
  receiver.preferences.theme = 'night';
  const old = legacy(receiver), before = json(old);
  const migrated = validateDesk(old);
  assert.equal(migrated.schemaVersion, 4);
  for (const key of Object.keys(old).filter(key => key !== 'schemaVersion')) assert.deepEqual(migrated[key], old[key], key);
  assert.deepEqual(migrated.local.readMessageIds, old.messages.map(message => message.id));
  assert.deepEqual(migrated.local.arrivals, [], 'migration does not invent arrival summaries');
  assert.equal(json(old), before);
  assert.equal(threadFacts(migrated, groupThreads(migrated)[0]).unreadCount, 0);
  const replay = await deliver(migrated, bag);
  assert.equal(replay.desk, migrated);
  assert.deepEqual(replay.desk.local.arrivals, []);
});

test('version-1 full backups restore through migration; current backups round-trip all private notes', async () => {
  let sender = post(station('A'), 'Mail').desk;
  let desk = (await deliver(station('B'), pack(sender).bag)).desk;
  const old = legacy(desk);
  const oldBackup = {format: 'sneakernet-social-club/desk', version: 1, exportedAt: '2026-11-21T12:00:00.000Z', desk: old};
  const migrated = parseBackup(json(oldBackup));
  assert.deepEqual(migrated.local.readMessageIds, desk.messages.map(message => message.id));
  desk = setThreadFlag(desk, desk.messages[0].id, 'bookmarked', true);
  desk = setThreadFlag(desk, desk.messages[0].id, 'archived', true);
  desk = setThreadFlag(desk, desk.messages[0].id, 'followed', true);
  desk = markBackupStarted(desk, '2026-11-21T13:14:15.000Z');
  const emitted = serializeBackup(desk);
  assert.equal(JSON.parse(emitted).version, 4);
  assert.deepEqual(parseBackup(emitted), desk);
  assert.equal(makeBackup(desk).version, 4);
  const mismatched = {...oldBackup, desk};
  assert.throws(() => parseBackup(json(mismatched)), /does not match its desk schema/);
  const hiddenLegacy = copy(oldBackup); hiddenLegacy.desk.local = desk.local;
  assert.throws(() => parseBackup(json(hiddenLegacy)), /unsupported field \(local\)/);
  const future = {...JSON.parse(emitted), version: 5};
  assert.throws(() => parseBackup(json(future)), /unsupported version/);
});

test('new authored mail is read and imported mail is unread; handles never determine identity', async () => {
  const original = post(station('Same handle', 'Cumberland'), 'My card');
  let local = original.desk;
  assert.deepEqual(local.local.readMessageIds, [original.message.id]);
  assert.equal(threadFacts(local, groupThreads(local)[0]).isMine, true);
  let other = (await deliver(station('Same handle', 'DEF CON'), pack(local).bag)).desk;
  let facts = threadFacts(other, groupThreads(other)[0]);
  assert.equal(facts.isMine, false);
  assert.equal(facts.unreadCount, 1);
  other = post(other, 'A reply from another station with the same handle', original.message.id).desk;
  local = (await deliver(local, pack(other).bag)).desk;
  facts = threadFacts(local, groupThreads(local)[0]);
  assert.equal(facts.isMine, true);
  assert.equal(facts.unreadCount, 1);
  assert.equal(facts.hasNewReplies, true);
  assert.equal(local.local.readMessageIds.includes(original.message.id), true);
  local = markMessagesRead(local, groupThreads(local)[0].messages.map(message => message.id));
  assert.equal(threadFacts(local, groupThreads(local)[0]).hasNewReplies, false);
  local = markMessagesRead(local, [original.message.id], false);
  assert.equal(threadFacts(local, groupThreads(local)[0]).unreadCount, 1);
  assert.equal(threadFacts(local, groupThreads(local)[0]).hasNewReplies, false, 'an unread root is not a new reply');
});

test('new-replies facts include participated and explicitly followed threads, excluding own replies', async () => {
  let source = post(station('A'), 'Root').desk;
  const rootId = source.messages[0].id;
  let reader = (await deliver(station('B'), pack(source).bag)).desk;
  reader = markMessagesRead(reader, [rootId]);
  source = post(source, 'Reply by origin station', rootId).desk;
  reader = (await deliver(reader, pack(source).bag)).desk;
  let thread = groupThreads(reader)[0];
  assert.equal(threadFacts(reader, thread).hasNewReplies, false);
  reader = setThreadFlag(reader, rootId, 'followed', true);
  assert.equal(threadFacts(reader, thread).hasNewReplies, true);
  reader = setThreadFlag(reader, rootId, 'followed', false);
  const own = post(reader, 'I can help', rootId); reader = own.desk;
  assert.equal(threadFacts(reader, groupThreads(reader)[0]).hasNewReplies, true, 'a station that replied participates in the thread');
  reader = markMessagesRead(reader, reader.messages.map(message => message.id));
  reader = markMessagesRead(reader, [own.message.id], false);
  assert.equal(threadFacts(reader, groupThreads(reader)[0]).hasNewReplies, false, 'a private unread toggle does not make an own reply newly received');
});

test('bookmarks, archive and follow flags move with orphan threads when missing parents arrive', async () => {
  const root = post(station('A'), 'Root');
  const middle = post(station('B'), 'Middle reply', root.message.id);
  const leaf = post(station('C'), 'Leaf reply', middle.message.id);
  let reader = (await deliver(station('D'), pack(leaf.desk).bag)).desk;
  assert.equal(groupThreads(reader)[0].id, middle.message.id);
  for (const flag of ['bookmarked', 'archived', 'followed']) reader = setThreadFlag(reader, middle.message.id, flag, true);
  reader.selected = [middle.message.id];
  const immutable = copy(reader.messages[0]);
  reader = (await deliver(reader, pack(middle.desk).bag)).desk;
  assert.equal(groupThreads(reader)[0].id, root.message.id);
  assert.deepEqual(reader.selected, [root.message.id]);
  for (const key of ['bookmarkedThreadIds', 'archivedThreadIds', 'followedThreadIds']) assert.deepEqual(reader.local[key], [root.message.id]);
  reader = (await deliver(reader, pack(root.desk).bag)).desk;
  const facts = threadFacts(reader, groupThreads(reader)[0]);
  assert.equal(facts.isCarrying && facts.isBookmarked && facts.isArchived && facts.isFollowed, true);
  assert.deepEqual(reader.messages.find(message => message.id === leaf.message.id), immutable);
  assert.equal(reader.messages.length, 3);
  reader = setThreadFlag(reader, leaf.message.id, 'bookmarked', false);
  assert.deepEqual(reader.local.bookmarkedThreadIds, [], 'a known child ID resolves to its current thread');
});

test('new paths create an arrival without changing known-message read state, and replay is a strict no-op', async () => {
  const sender = post(station('A', 'Cumberland'), 'Postcard').desk;
  const first = pack(sender).bag;
  let reader = (await deliver(station('B', 'DEF CON'), first)).desk;
  const messageId = reader.messages[0].id;
  reader = markMessagesRead(reader, [messageId]);
  const second = pack(sender).bag;
  const before = json(reader);
  await previewMailbag(reader, serializeMailbag(second));
  assert.equal(json(reader), before, 'a preview creates no read changes or arrivals');
  reader = (await deliver(reader, second)).desk;
  assert.deepEqual(reader.local.readMessageIds, [messageId]);
  assert.equal(reader.local.arrivals.length, 2);
  const arrival = reader.local.arrivals[1];
  assert.deepEqual(arrival.newMessageIds, []);
  assert.deepEqual(arrival.messageIds, [messageId]);
  assert.equal(arrival.bagId, second.id);
  assert.equal(arrival.pathReceipts.length, 1);
  const receipt = arrival.pathReceipts[0];
  const mark = reader.routes.flatMap(route => route.path).find(mark => mark.id === receipt.markId);
  assert.equal(receipt.messageId, messageId);
  assert.equal(mark.kind, 'received');
  assert.equal(mark.stationId, reader.station.id);
  assert.equal(mark.at, arrival.receivedAt);
  const replay = await deliver(reader, second);
  assert.equal(replay.desk, reader);
  assert.equal(replay.desk.local.arrivals.length, 2);
  const extended = pack(reader).desk;
  assert.ok(extended.routes.some(route => route.path.some(mark => mark.id === receipt.markId)), 'the receipt remains locatable after the path extends');
  assert.deepEqual(parseBackup(serializeBackup(extended)).local.arrivals, reader.local.arrivals);
});

test('arrival order follows acceptance even when the clock moves backwards', async () => {
  const NativeDate = globalThis.Date;
  const source = post(station('A'), 'A card').desk;
  const first = pack(source).bag, second = pack(source).bag;
  let reader = station('B');
  try {
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2099-01-01T00:00:00.000Z'])); }
    };
    reader = (await deliver(reader, first)).desk;
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['1999-01-01T00:00:00.000Z'])); }
    };
    reader = (await deliver(reader, second)).desk;
  } finally { globalThis.Date = NativeDate; }
  assert.deepEqual(reader.local.arrivals.map(arrival => arrival.bagId), [first.id, second.id]);
  assert.ok(reader.local.arrivals[0].receivedAt > reader.local.arrivals[1].receivedAt);
});

test('recent arrivals stop at 100 without losing mail, paths, or the older replay receipts', async () => {
  const original = pack(post(station('A'), 'One card in many distinct envelopes').desk).bag;
  let reader = station('B');
  for (let i = 0; i < 103; i++) {
    const bag = copy(original);
    if (i) bag.id = `bag_${crypto.randomUUID()}`;
    reader = (await deliver(reader, bag)).desk;
  }
  assert.equal(reader.local.arrivals.length, 100);
  assert.equal(reader.local.arrivals.some(arrival => arrival.bagId === original.id), false);
  assert.equal(reader.messages.length, 1);
  assert.equal(reader.routes.length, 103);
  assert.equal(Object.keys(reader.seenBags).length, 103);
  assert.equal((await deliver(reader, original)).desk, reader);
});

test('arrival reference bound prunes whole summaries while preserving all causal receipts', async () => {
  let desk = station('A');
  for (let i = 0; i < 1500; i++) {
    const at = '2026-11-21T12:00:00.000Z', messageId = `msg_${crypto.randomUUID()}`;
    desk.messages.push({id: messageId, parentId: null, handle: 'A', body: 'Card', createdAt: at});
    desk.routes.push({messageId, path: [{id: `mark_${crypto.randomUUID()}`, stationId: desk.station.id, handle: 'A', postmark: '', kind: 'written', at}]});
    desk.local.readMessageIds.push(messageId);
  }
  let reader = station('B');
  const initial = pack(desk).bag;
  reader = (await deliver(reader, initial)).desk;
  for (let i = 0; i < 4; i++) {
    const outgoing = pack(reader); reader = outgoing.desk;
    reader = (await deliver(reader, outgoing.bag)).desk;
  }
  assert.equal(reader.local.arrivals.length, 4);
  assert.equal(reader.local.arrivals.some(arrival => arrival.bagId === initial.id), false);
  const references = reader.local.arrivals.reduce((total, arrival) => total + arrival.newMessageIds.length + arrival.messageIds.length + 2 * arrival.pathReceipts.length, 0);
  assert.ok(references <= LIMITS.arrivalReferences);
  assert.equal(reader.messages.length, 1500);
  assert.equal(reader.routes.length, 1500);
  assert.equal(reader.routes[0].path.length, 11);
  assert.equal(Object.keys(reader.seenBags).length, 5);
});

test('all private feature state stays out of public mailbags and is retained in full backups', async () => {
  let sender = post(station('A'), 'Public postcard').desk;
  let desk = (await deliver(station('B'), pack(sender).bag)).desk;
  const threadId = groupThreads(desk)[0].id;
  desk = markMessagesRead(desk, desk.messages.map(message => message.id));
  for (const flag of ['bookmarked', 'archived', 'followed']) desk = setThreadFlag(desk, threadId, flag, true);
  desk = markBackupStarted(desk, '2026-11-21T17:00:00.000Z');
  desk.drafts.post = 'PRIVATE POSTCARD'; desk.drafts.replies[threadId] = 'PRIVATE REPLY';
  desk.preferences.theme = 'contrast'; desk.selected = [threadId];
  const before = json(desk), outgoing = prepareMailbag(desk);
  const text = serializeMailbag(outgoing.bag);
  for (const secret of ['PRIVATE POSTCARD', 'PRIVATE REPLY', 'readMessageIds', 'bookmarkedThreadIds', 'archivedThreadIds', 'followedThreadIds', 'lastBackupAt', 'pathReceipts', 'preferences', 'seenBags']) assert.equal(text.includes(secret), false, secret);
  assert.equal(outgoing.bag.version, 1);
  assert.deepEqual(Object.keys(outgoing.bag).sort(), ['format', 'id', 'messages', 'packedAt', 'routes', 'version']);
  assert.equal(json(desk), before);
  assert.deepEqual(parseBackup(serializeBackup(desk)), desk);
});

test('draft and private-note validation rejects malformed input without mutating the desk', async () => {
  const desk = post(station('A'), 'Mail').desk;
  const drafts = {post: 'Private\ntext', replies: {[desk.messages[0].id]: 'Reply\ttext'}};
  const validated = validateDrafts(drafts); validated.post = 'Changed';
  assert.equal(drafts.post, 'Private\ntext');
  for (const value of [
    {...drafts, extra: 'hidden'},
    {post: 'x'.repeat(2001), replies: {}},
    {post: '\u0000', replies: {}},
    {post: '', replies: {not_an_id: 'Bad key'}},
  ]) assert.throws(() => validateDrafts(value));
  const before = json(desk);
  assert.throws(() => markMessagesRead(desk, [`msg_${crypto.randomUUID()}`]), /already on this desk/);
  assert.throws(() => setThreadFlag(desk, desk.messages[0].id, 'public', true), /Choose bookmarked/);
  assert.throws(() => setThreadFlag(desk, desk.messages[0].id, 'archived', 'yes'), /on or off/);
  assert.throws(() => markBackupStarted(desk, 'yesterday'), /ISO date/);
  const malformed = copy(desk); malformed.local.readMessageIds.push(`msg_${crypto.randomUUID()}`);
  assert.throws(() => validateDesk(malformed), /not on this desk/);
  const bogus = copy(desk); bogus.local.coordinates = [39, -78];
  assert.throws(() => validateDesk(bogus), /unsupported field/);
  assert.equal(json(desk), before);
});

