/** Deterministic, fictional records for protocol limits and repeatable measurements. */
const id = (kind, value) => `${kind}_00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const AT = '2026-01-01T12:00:00.000Z';
export const PROFILES = Object.freeze([
  {name: 'club-desk', messages: 100, perThread: 2, paths: 2, steps: 4, receipts: 10},
  {name: 'busy-tray', messages: 2000, perThread: 1, paths: 1, steps: 6, receipts: 100},
  {name: 'travelled-desk', messages: 1000, perThread: 2, paths: 2, steps: 9, receipts: 100},
]);

export function makeLargeDesk({messages = 100, perThread = 2, paths = 1, steps = 5, receipts = 10, offset = 0} = {}) {
  let markCounter = offset * 100000 + 1;
  const station = {id: id('station', offset + 1), handle: 'Test local maker', postmark: 'Fictional Cumberland table'};
  const remote = {id: id('station', offset + 100), handle: 'Test visiting maker', postmark: 'Fictional hamfest'};
  const desk = {
    schemaVersion: 3, station, messages: [], routes: [], seenBags: {},
    drafts: {post: 'Private draft — never in a mailbag.', replies: {}}, selected: [],
    preferences: {theme: 'day'}, local: {readMessageIds: [], bookmarkedThreadIds: [],
      archivedThreadIds: [], followedThreadIds: [], lastBackupAt: null, arrivals: [], outbox: []},
  };
  const receiptsByNumber = new Map();
  const stamp = (source, kind) => ({id: id('mark', markCounter++), stationId: source.id, handle: source.handle,
    postmark: source.postmark, kind, at: AT});
  for (let i = 0; i < messages; i++) {
    const messageId = id('msg', offset * 100000 + i + 1), root = Math.floor(i / perThread) * perThread;
    const author = i % 3 === 0 ? station : remote;
    const message = {id: messageId, parentId: i === root ? null : id('msg', offset * 100000 + root + 1),
      handle: author.handle, body: `Fictional postcard ${i + 1}: rotary encoder, soldering notes, and next month's maker meetup. ` + 'A useful public note. '.repeat(4), createdAt: AT};
    desk.messages.push(message);
    const origin = stamp(author, 'written');
    const receiptNumber = receipts ? Math.min(receipts - 1, Math.floor(i * receipts / messages)) : null;
    let receipt = null;
    if (receiptNumber !== null) {
      if (!receiptsByNumber.has(receiptNumber)) receiptsByNumber.set(receiptNumber, {
        bagId: id('bag', offset * 100000 + receiptNumber + 1), packedAt: AT, messageIds: [], pathHeads: [],
      });
      receipt = receiptsByNumber.get(receiptNumber); receipt.messageIds.push(messageId);
    }
    for (let branch = 0; branch < paths; branch++) {
      const path = [structuredClone(origin)];
      for (let j = 1; j < steps; j++) path.push(stamp(j === steps - 2 ? station : remote, j === steps - 2 ? 'packed' : 'received'));
      desk.routes.push({messageId, path});
      if (receipt) receipt.pathHeads.push({messageId, markId: path[steps - 2].id});
    }
    if (i % 3 !== 1) desk.local.readMessageIds.push(messageId);
    if (i === root) {
      if (i % 10 === 0) desk.selected.push(messageId);
      if (i % 13 === 0) desk.local.bookmarkedThreadIds.push(messageId);
      if (i % 17 === 0) desk.local.archivedThreadIds.push(messageId);
      if (i % 19 === 0) desk.local.followedThreadIds.push(messageId);
    }
  }
  desk.local.outbox = [...receiptsByNumber.values()];
  return desk;
}
