import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesk, validateDesk, createMessage, groupThreads, prepareMailbag,
  previewMailbag, acceptMailbag, makeBackup, parseBackup, LIMITS,
  serializeMailbag, serializeBackup, assertDeskCapacity,
} from '../src/core.js';

const copy = x => structuredClone(x);
const text = x => JSON.stringify(x);
function station(handle, postmark = '') {
  const d = newDesk(); d.station.handle = handle; d.station.postmark = postmark; return d;
}
function write(desk, body, parentId = null) { return createMessage(desk, {body, parentId}); }
function pack(desk, ids = groupThreads(desk).map(t => t.id)) { return prepareMailbag(desk, ids); }
async function deliver(desk, bag) {
  const preview = await previewMailbag(desk, serializeMailbag(bag));
  return acceptMailbag(desk, preview.bag);
}

test('three stations carry Cumberland mail out and a DEF CON reply home', async () => {
  let A = station('Mike', 'Cumberland Maker Meetup');
  let B = station('Courier', 'Hamfest swap table');
  let C = station('Jules', 'DEF CON');
  const posted = write(A, 'Who’s got a spare rotary encoder?'); A = posted.desk;
  const rootId = posted.message.id;
  const first = pack(A); A = first.desk;
  B = (await deliver(B, first.bag)).desk;
  const onward = pack(B); B = onward.desk;
  C = (await deliver(C, onward.bag)).desk;
  const reply = write(C, 'I have a spare. Happy to send it back with the next maker.', rootId); C = reply.desk;
  const returnTrip = pack(C); C = returnTrip.desk;
  B = (await deliver(B, returnTrip.bag)).desk;
  const home = pack(B); B = home.desk;
  const preview = await previewMailbag(A, text(home.bag));
  assert.deepEqual(preview.counts, {newPosts: 0, newReplies: 1, seenMessages: 1, newPaths: 2});
  const arrived = await deliver(A, home.bag); A = arrived.desk;
  assert.equal(groupThreads(A).length, 1);
  assert.deepEqual(groupThreads(A)[0].messages.map(m => m.id), [rootId, reply.message.id]);
  assert.equal(A.routes.filter(r => r.messageId === rootId).length, 1);
  const rootPath = A.routes.find(r => r.messageId === rootId).path;
  assert.deepEqual(rootPath.map(p => `${p.handle}:${p.kind}`), [
    'Mike:written', 'Mike:packed', 'Courier:received', 'Courier:packed',
    'Jules:received', 'Jules:packed', 'Courier:received', 'Courier:packed', 'Mike:received',
  ]);
  assert.deepEqual(A.routes.find(r => r.messageId === reply.message.id).path.map(p => p.postmark), [
    'DEF CON', 'DEF CON', 'Hamfest swap table', 'Hamfest swap table', 'Cumberland Maker Meetup',
  ]);
  const beforeReplay = text(A);
  const replay = await deliver(A, home.bag);
  assert.equal(replay.desk, A, 'replay returns the original desk object unchanged');
  assert.equal(text(replay.desk), beforeReplay);
  assert.equal(replay.summary.alreadyOpened, true);
  assert.equal(replay.summary.newPaths, 0);
});

test('reply before parent survives, can itself be exported, and reconnects when parent arrives', async () => {
  let sender = station('Mike', 'Cumberland');
  const original = write(sender, 'Who has an encoder?'); sender = original.desk;
  let orphanSender = station('Jules', 'DEF CON');
  const orphan = write(orphanSender, 'I have one.', original.message.id); orphanSender = orphan.desk;
  const orphanBag = pack(orphanSender);
  let receiver = station('Reader');
  receiver = (await deliver(receiver, orphanBag.bag)).desk;
  let threads = groupThreads(receiver);
  assert.equal(threads.length, 1); assert.equal(threads[0].root, null);
  assert.equal(threads[0].missingParentId, original.message.id);
  assert.deepEqual(threads[0].messages.map(m => m.id), [orphan.message.id]);
  receiver.selected = [original.message.id];
  const forwarded = pack(receiver); receiver = forwarded.desk;
  assert.equal(forwarded.bag.messages.length, 1);
  assert.equal(forwarded.bag.messages[0].parentId, original.message.id);
  receiver = (await deliver(receiver, pack(sender).bag)).desk;
  threads = groupThreads(receiver);
  assert.equal(threads.length, 1); assert.equal(threads[0].root.id, original.message.id);
  assert.deepEqual(threads[0].messages.map(m => m.id), [original.message.id, orphan.message.id]);
  assert.deepEqual(receiver.selected, [original.message.id]);
});

test('two returning copies retain two known paths and do not invent a merged journey', async () => {
  let A = station('A', 'Cumberland'); A = write(A, 'A travelling card').desk;
  const initial = pack(A); A = initial.desk;
  let B = station('B', 'Hamfest'), C = station('C', 'DEF CON'), D = station('D', 'Club house');
  B = (await deliver(B, initial.bag)).desk;
  C = (await deliver(C, initial.bag)).desk;
  D = (await deliver(D, pack(B).bag)).desk;
  const second = await deliver(D, pack(C).bag); D = second.desk;
  assert.equal(second.summary.newPosts, 0);
  assert.equal(D.messages.length, 1);
  assert.equal(D.routes.length, 2);
  for (const route of D.routes) {
    const handles = new Set(route.path.map(p => p.handle));
    assert.equal(handles.has('B') && handles.has('C'), false);
    assert.equal(route.path.at(-1).handle, 'D');
  }
  A = (await deliver(A, pack(D).bag)).desk;
  assert.equal(A.routes.length, 2);
  assert.equal(A.messages.length, 1);
});

test('handoff order survives disagreeing clocks', async () => {
  let A = station('A', 'Cumberland'); A = write(A, 'Clock test').desk;
  A.messages[0].createdAt = '2099-08-01T12:00:00.000Z';
  A.routes[0].path[0].at = A.messages[0].createdAt;
  let B = station('B', 'DEF CON'); B = (await deliver(B, pack(A).bag)).desk;
  const path = B.routes[0].path;
  assert.equal(path[0].at, '2099-08-01T12:00:00.000Z');
  assert.equal(path[0].kind, 'written'); assert.equal(path.at(-1).kind, 'received');
  assert.deepEqual(path.map(p => p.handle), ['A', 'A', 'B']);
});

test('full desk backup restores private drafts, choices, identity, paths, and replay receipts', async () => {
  let source = station('Sender'); source = write(source, 'Public mail').desk;
  const bag = pack(source).bag;
  let desk = station('Reader', 'Workshop'); desk = (await deliver(desk, bag)).desk;
  desk.drafts.post = 'Private unfinished postcard';
  desk.drafts.replies[desk.messages[0].id] = 'Private unfinished reply';
  desk.preferences.theme = 'contrast'; desk.selected = [desk.messages[0].id];
  const restored = parseBackup(text(makeBackup(desk)));
  assert.deepEqual(restored, desk);
  const reopened = await deliver(restored, bag);
  assert.equal(reopened.desk, restored);
  assert.deepEqual(reopened.desk, desk);
});

test('mailbags contain public selection only; preparation leaves the desk untouched', () => {
  let desk = station('Mike', 'Cumberland');
  const first = write(desk, 'Selected public card'); desk = first.desk;
  desk = write(desk, 'Unselected public card').desk;
  desk.drafts.post = 'SECRET private draft';
  desk.drafts.replies[first.message.id] = 'SECRET private reply';
  desk.preferences.theme = 'night'; desk.selected = [first.message.id];
  const before = text(desk), packed = prepareMailbag(desk);
  assert.equal(text(desk), before);
  assert.equal(packed.bag.messages.length, 1);
  assert.equal(packed.bag.messages[0].id, first.message.id);
  assert.equal(text(packed.bag).includes('SECRET'), false);
  assert.equal(text(packed.bag).includes('Unselected public card'), false);
  for (const key of ['drafts', 'preferences', 'seenBags', 'selected', 'local']) assert.equal(own(packed.bag, key), false);
  assert.equal(packed.desk.routes.find(r => r.messageId === first.message.id).path.at(-1).kind, 'packed');
});
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }

test('damaged, unsupported, hidden-field, and unsafe-property input is atomic', async () => {
  let sender = station('A'); sender = write(sender, 'Mail').desk;
  const good = pack(sender).bag, desk = station('B'), before = text(desk);
  const version = copy(good); version.version = 2;
  const hidden = copy(good); hidden.routes[0].path[0].latitude = 39.65;
  const oversized = copy(good); oversized.messages[0].body = 'x'.repeat(LIMITS.body + 1);
  for (const raw of ['{broken', text(version), text(hidden), text(oversized), text(good).replace('"version":1', '"version":1,"__proto__":{"polluted":true}')]) {
    await assert.rejects(() => previewMailbag(desk, raw));
    assert.equal(text(desk), before);
  }
  assert.equal({}.polluted, undefined);
});

test('a reused bag ID with changed contents is rejected; JSON formatting is harmless', async () => {
  let sender = station('A'); sender = write(sender, 'Mail').desk;
  const bag = pack(sender).bag;
  let receiver = station('B'); receiver = (await deliver(receiver, bag)).desk;
  assert.equal((await previewMailbag(receiver, JSON.stringify(bag, null, 4))).alreadyOpened, true);
  const tampered = copy(bag); tampered.packedAt = '2030-01-01T00:00:00.000Z';
  await assert.rejects(() => previewMailbag(receiver, text(tampered)), /bag ID.*contents have changed/);
});

test('conflicting message identity is rejected before any desk data changes', async () => {
  let source = station('A'); source = write(source, 'Original').desk;
  const bag = pack(source).bag;
  let desk = station('B'); desk = (await deliver(desk, bag)).desk;
  const changed = copy(bag); changed.id = `bag_${crypto.randomUUID()}`; changed.messages[0].body = 'Replacement';
  const before = text(desk);
  await assert.rejects(() => previewMailbag(desk, text(changed)), /existing message ID/);
  assert.equal(text(desk), before);
});

test('postmark collisions and causal splicing are rejected', async () => {
  let source = station('A'); source = write(source, 'Original').desk;
  const bag = pack(source).bag;
  let desk = station('B'); desk = (await deliver(desk, bag)).desk;
  const changed = copy(bag); changed.id = `bag_${crypto.randomUUID()}`;
  changed.routes[0].path[1].postmark = 'A changed claim';
  await assert.rejects(() => previewMailbag(desk, text(changed)), /postmark ID has conflicting/);
  const splice = pack(desk).bag;
  const alternate = copy(splice.routes[0]);
  alternate.path[1] = {...alternate.path[1], id: `mark_${crypto.randomUUID()}`};
  splice.routes.push(alternate);
  await assert.rejects(() => previewMailbag(station('C'), text(splice)), /different predecessor/);
});

test('a cycle created only by joining two otherwise valid partial desks is rejected', async () => {
  const aId = `msg_${crypto.randomUUID()}`, bId = `msg_${crypto.randomUUID()}`;
  let A = write(station('A'), 'Reply A', bId).desk;
  const oldA = A.messages[0].id; A.messages[0].id = aId; A.routes[0].messageId = aId;
  A.local.readMessageIds = [aId];
  let B = write(station('B'), 'Reply B', aId).desk;
  B.messages[0].id = bId; B.routes[0].messageId = bId;
  B.local.readMessageIds = [bId];
  const before = text(A);
  await assert.rejects(() => previewMailbag(A, text(pack(B).bag)), /circular reply chain/);
  assert.equal(text(A), before); assert.notEqual(aId, oldA);
});

test('an unseen original bag preserves a direct shortcut after a longer route arrived', async () => {
  const sender = write(station('A'), 'Mail').desk;
  const original = pack(sender).bag;
  let B = (await deliver(station('B'), original)).desk;
  let C = (await deliver(station('C'), pack(B).bag)).desk;
  const preview = await previewMailbag(C, text(original));
  assert.equal(preview.counts.newPaths, 1);
  assert.equal(preview.counts.seenMessages, 1);
  C = (await deliver(C, original)).desk;
  assert.equal(C.messages.length, 1);
  assert.equal(C.routes.length, 2);
  const handles = C.routes.map(r => r.path.map(p => p.handle));
  assert.ok(handles.some(path => path.join(',') === 'A,A,C'));
  assert.ok(handles.some(path => path.join(',') === 'A,A,B,B,C'));
  const before = text(C);
  C = (await deliver(C, original)).desk;
  assert.equal(text(C), before, 'same bag ID must still add no duplicate handoff');
});

test('empty starts, handle requirements, duplicate IDs, and format mixups are explicit', async () => {
  const empty = newDesk();
  assert.deepEqual(empty.messages, []); assert.deepEqual(groupThreads(empty), []);
  assert.throws(() => write(empty, 'Hello'), /handle/);
  assert.throws(() => pack(station('A')), /Select at least one/);
  const desk = write(station('A'), 'Hello').desk, bag = pack(desk).bag;
  const duplicate = copy(bag); duplicate.messages.push(copy(duplicate.messages[0]));
  await assert.rejects(() => previewMailbag(empty, text(duplicate)), /repeats a message ID/);
  await assert.rejects(() => previewMailbag(empty, text(makeBackup(desk))), /full-desk backup/);
  assert.throws(() => parseBackup(text(bag)), /public mailbag/);
  const invalid = copy(desk); invalid.preferences.theme = 'mystery';
  assert.throws(() => validateDesk(invalid), /color mode/);
});

function bulkDesk(count, body, handle = 'A', postmark = '') {
  const desk = station(handle, postmark);
  for (let i = 0; i < count; i++) {
    const message = {id: `msg_${crypto.randomUUID()}`, parentId: null, handle, body, createdAt: '2026-11-21T12:00:00.000Z'};
    desk.messages.push(message);
    desk.routes.push({messageId: message.id, path: [{
      id: `mark_${crypto.randomUUID()}`, stationId: desk.station.id, handle, postmark, kind: 'written', at: message.createdAt,
    }]});
  }
  desk.local.readMessageIds = desk.messages.map(message => message.id);
  return desk;
}

const utf8Bytes = value => new TextEncoder().encode(value).byteLength;

test('1,850 full postcards export compact text that reopens even when pretty JSON exceeds 5 MiB', async () => {
  const desk = bulkDesk(1850, 'x'.repeat(2000), 'Maker A', 'Cumberland Maker Meetup'), before = text(desk);
  const prepared = pack(desk);
  const pretty = `${JSON.stringify(prepared.bag, null, 2)}\n`;
  const emitted = serializeMailbag(prepared.bag);
  assert.ok(utf8Bytes(pretty) > LIMITS.fileBytes, 'reproduces the original compact-check/pretty-download mismatch');
  assert.ok(utf8Bytes(emitted) < LIMITS.fileBytes);
  assert.deepEqual(JSON.parse(emitted), prepared.bag);
  const preview = await previewMailbag(station('B'), emitted);
  assert.equal(preview.counts.newPosts, 1850);
  const received = await acceptMailbag(station('B'), preview.bag);
  assert.equal(received.desk.messages.length, 1850);
  assert.equal(text(desk), before, 'serialization and preparation leave the source desk unchanged');
  await assert.rejects(() => previewMailbag(station('C'), pretty), /larger than 5 MiB/);
});

test('mailbag limit measures exact UTF-8 bytes including the exported newline', async () => {
  const bag = pack(bulkDesk(1850, 'x'.repeat(2000))).bag;
  let remaining = LIMITS.fileBytes - utf8Bytes(serializeMailbag(bag));
  for (const message of bag.messages) {
    if (!remaining) break;
    const triples = Math.min(Math.floor(remaining / 2), LIMITS.body);
    let body = '界'.repeat(triples); remaining -= triples * 2;
    if (body.length < LIMITS.body && remaining) { body += 'é'; remaining--; }
    message.body = body + 'x'.repeat(LIMITS.body - body.length);
  }
  assert.equal(remaining, 0);
  const emitted = serializeMailbag(bag);
  assert.equal(utf8Bytes(emitted), LIMITS.fileBytes);
  assert.ok(emitted.endsWith('\n'));
  assert.equal((await previewMailbag(station('B'), emitted)).counts.newPosts, 1850);
  const next = copy(bag), extra = next.messages.find(message => message.body.includes('x'));
  extra.body = extra.body.replace('x', 'é');
  assert.equal(utf8Bytes(`${JSON.stringify(next)}\n`), LIMITS.fileBytes + 1);
  assert.throws(() => serializeMailbag(next), /larger than 5 MiB/);
  await assert.rejects(() => previewMailbag(station('B'), emitted + ' '), /larger than 5 MiB/);
});

test('every accepted desk has a reopenable full backup; oversized multibyte draft commits fail safely', () => {
  const desk = bulkDesk(2000, '界'.repeat(2000));
  // Start near the backup bound using legal private drafts, without relying on
  // code-unit counts as a proxy for either JSON escapes or UTF-8 byte size.
  const template = {format: 'sneakernet-social-club/desk', version: 4, exportedAt: '2000-01-01T00:00:00.000Z', desk};
  desk.local.lastBackupAt = '2000-01-01T00:00:00.000Z';
  const initial = utf8Bytes(`${JSON.stringify(template)}\n`);
  const draftBytes = utf8Bytes(`"${desk.messages[0].id}":"${'界'.repeat(2000)}"`) + 1;
  const count = Math.floor((LIMITS.backupBytes - initial - 1000) / draftBytes);
  assert.ok(count > 0 && count < LIMITS.messages);
  for (const message of desk.messages.slice(0, count)) desk.drafts.replies[message.id] = '界'.repeat(2000);
  const checked = validateDesk(desk);
  const emitted = serializeBackup(checked);
  assert.ok(utf8Bytes(emitted) <= LIMITS.backupBytes);
  assert.equal(JSON.parse(emitted).version, 4);
  assert.deepEqual(parseBackup(emitted), checked);
  const tooLarge = copy(checked);
  for (const message of tooLarge.messages.slice(count, count + 2)) tooLarge.drafts.replies[message.id] = '界'.repeat(2000);
  const before = text(checked);
  assert.throws(() => assertDeskCapacity(tooLarge), /20 MiB full-backup limit/);
  assert.throws(() => validateDesk(tooLarge), /20 MiB full-backup limit/);
  assert.throws(() => serializeBackup(tooLarge), /20 MiB full-backup limit/);
  assert.equal(text(checked), before);
  assert.throws(() => parseBackup(emitted + ' '.repeat(LIMITS.backupBytes - utf8Bytes(emitted) + 1)), /larger than 20 MiB/);
});
