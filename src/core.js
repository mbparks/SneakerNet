/* Sneakernet Social Club — protocol and desk model. No network or storage access. */
export const VERSION = '1.5.0-rc.1';
export const MAILBAG_FORMAT = 'sneakernet-social-club/mailbag';
export const BACKUP_FORMAT = 'sneakernet-social-club/desk';
export const LIMITS = Object.freeze({
  body: 2000, handle: 40, postmark: 80,
  fileBytes: 5 * 1024 * 1024, backupBytes: 20 * 1024 * 1024,
  messages: 2000, routes: 4000, stepsPerRoute: 512, totalSteps: 20000,
  receipts: 20000, arrivals: 100, arrivalReferences: 20000,
  outbox: 100, outboxReferences: 20000,
});

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID = Object.fromEntries(['station', 'msg', 'mark', 'bag'].map(p => [p, new RegExp(`^${p}_${UUID}$`)]));
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const clone = value => structuredClone(value);
const utf8 = new TextEncoder();
const bytes = value => utf8.encode(value).byteLength;
const now = () => new Date().toISOString();
const fail = message => { throw new Error(message); };
const jsonFile = value => `${JSON.stringify(value)}\n`;
const CAPACITY_DATE = '2000-01-01T00:00:00.000Z';
const FLAG_KEYS = Object.freeze({bookmarked: 'bookmarkedThreadIds', archived: 'archivedThreadIds', followed: 'followedThreadIds'});

function newLocal() {
  return {readMessageIds: [], bookmarkedThreadIds: [], archivedThreadIds: [], followedThreadIds: [], lastBackupAt: null, arrivals: [], outbox: [], readingPositions: []};
}

function uid(prefix) {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) fail('This browser cannot generate message IDs. Open the app in a current browser using HTTPS or localhost.');
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
  const h = Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a JSON object.`);
}
function exact(value, keys, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains an unsupported field (${key}). Nothing was imported.`);
  for (const key of keys) if (!own(value, key)) fail(`${label} is missing ${key}.`);
}
function array(value, max, label) {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  if (value.length > max) fail(`${label} exceeds the supported limit of ${max.toLocaleString('en-US')}. Nothing was changed.`);
}
function textValue(value, max, label, {empty = false, multiline = false} = {}) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  if (value.length > max) fail(`${label} must be ${max} characters or fewer.`);
  if (!empty && !value.trim()) fail(`${label} cannot be empty.`);
  if ((multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) fail(`${label} contains unsupported control characters.`);
}
function id(value, prefix, label) {
  if (typeof value !== 'string' || !ID[prefix].test(value)) fail(`${label} is not a valid ${prefix} ID.`);
}
function date(value, label) {
  if (typeof value !== 'string' || value.length > 32 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO date and time in UTC.`);
}
function rejectUnsafe(value) {
  const pending = [{value, depth: 0}];
  let count = 0;
  while (pending.length) {
    const {value: item, depth} = pending.pop();
    if (depth > 20 || ++count > 400000) fail('This file is too deeply nested or contains too many values. Nothing was changed.');
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('This file contains an unsafe field name. Nothing was changed.');
        pending.push({value: item[key], depth: depth + 1});
      }
    }
  }
}
function parseJSON(raw, max, label) {
  if (typeof raw !== 'string') fail(`Choose a ${label} JSON file.`);
  if (bytes(raw) > max) fail(`This ${label} is larger than ${max / 1024 / 1024} MiB. Nothing was changed.`);
  let value;
  try { value = JSON.parse(raw); } catch { fail(`This ${label} is damaged or is not valid JSON. Your current desk has not changed.`); }
  rejectUnsafe(value);
  return value;
}

/** Stable JSON for equality and replay fingerprints; object key order is irrelevant. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
// Both sides have passed the exact public-field validators before these checks.
// Compare immutable primitive fields directly; repeated shared path prefixes do
// not need to allocate and sort a canonical JSON string for every appearance.
function sameMessage(a, b) {
  return a.id === b.id && a.parentId === b.parentId && a.handle === b.handle && a.body === b.body && a.createdAt === b.createdAt;
}
function sameMarkBinding(a, b) {
  return a.messageId === b.messageId && a.previousId === b.previousId &&
    a.mark.id === b.mark.id && a.mark.stationId === b.mark.stationId &&
    a.mark.handle === b.mark.handle && a.mark.postmark === b.mark.postmark &&
    a.mark.kind === b.mark.kind && a.mark.at === b.mark.at;
}

function validateMessages(messages) {
  array(messages, LIMITS.messages, 'Messages');
  const map = new Map();
  for (const m of messages) {
    exact(m, ['id', 'parentId', 'handle', 'body', 'createdAt'], 'A message');
    id(m.id, 'msg', 'Message ID');
    if (m.parentId !== null) id(m.parentId, 'msg', 'Parent ID');
    if (m.id === m.parentId) fail('A message cannot be its own parent. Nothing was changed.');
    textValue(m.handle, LIMITS.handle, 'Message handle');
    textValue(m.body, LIMITS.body, 'Message text', {multiline: true});
    date(m.createdAt, 'Message time');
    if (map.has(m.id)) fail('This file repeats a message ID inside its message list. Nothing was changed.');
    map.set(m.id, m);
  }
  assertNoCycles(map);
  return map;
}

function assertNoCycles(map) {
  const done = new Set();
  for (const first of map.keys()) {
    const path = new Set();
    let cursor = first;
    while (cursor && map.has(cursor) && !done.has(cursor)) {
      if (path.has(cursor)) fail('These messages contain a circular reply chain. Nothing was changed.');
      path.add(cursor); cursor = map.get(cursor).parentId;
    }
    for (const p of path) done.add(p);
  }
}

const routeKey = r => `${r.messageId}/${r.path.map(p => p.id).join('/')}`;
function maximalRoutes(routes) {
  const byKey = new Map(routes.map(r => [routeKey(r), r]));
  const keys = [...byKey.keys()].sort();
  return keys.filter((key, i) => !keys[i + 1]?.startsWith(`${key}/`)).map(key => byKey.get(key));
}
function validateRoutes(routes, messages, {allowMissing = false, union = false} = {}) {
  array(routes, LIMITS.routes * (union ? 2 : 1), 'Known paths');
  const marks = new Map(), origins = new Map(), covered = new Set();
  let totalSteps = 0;
  for (const route of routes) {
    exact(route, ['messageId', 'path'], 'A path');
    id(route.messageId, 'msg', 'Path message ID');
    const message = messages.get(route.messageId);
    if (!message && !allowMissing) fail('A path refers to a message that is not in this file. Nothing was changed.');
    array(route.path, LIMITS.stepsPerRoute, 'Postmarks on one path');
    if (!route.path.length) fail('Every path must begin with its original written postmark.');
    totalSteps += route.path.length;
    if (totalSteps > LIMITS.totalSteps * (union ? 2 : 1)) fail(`This desk or file contains more than ${LIMITS.totalSteps.toLocaleString('en-US')} recorded postmarks across its paths. Nothing was changed.`);
    covered.add(route.messageId);
    const within = new Set();
    for (let i = 0; i < route.path.length; i++) {
      const mark = route.path[i];
      exact(mark, ['id', 'stationId', 'handle', 'postmark', 'kind', 'at'], 'A postmark');
      id(mark.id, 'mark', 'Postmark ID'); id(mark.stationId, 'station', 'Station ID');
      textValue(mark.handle, LIMITS.handle, 'Postmark handle');
      textValue(mark.postmark, LIMITS.postmark, 'Volunteered postmark', {empty: true});
      date(mark.at, 'Postmark time');
      if (!['written', 'packed', 'received'].includes(mark.kind)) fail('This file has an unsupported postmark action.');
      if ((i === 0) !== (mark.kind === 'written')) fail('A path must start with one written postmark and cannot contain a second origin.');
      if (within.has(mark.id)) fail('A path repeats the same postmark ID. Nothing was changed.');
      within.add(mark.id);
      const binding = {messageId: route.messageId, previousId: i ? route.path[i - 1].id : null, mark};
      if (marks.has(mark.id) && !sameMarkBinding(marks.get(mark.id), binding)) fail('A postmark ID has conflicting contents or a different predecessor. Nothing was changed.');
      marks.set(mark.id, binding);
    }
    const origin = route.path[0];
    if (message && (origin.handle !== message.handle || origin.at !== message.createdAt)) fail('A postcard and its original written postmark disagree. Nothing was changed.');
    if (origins.has(route.messageId) && origins.get(route.messageId) !== origin.id) fail('One message ID claims two different origins. Nothing was changed.');
    origins.set(route.messageId, origin.id);
  }
  for (const messageId of messages.keys()) if (!covered.has(messageId)) fail('A message is missing its original postmark. Nothing was changed.');
  return {marks, origins};
}

function validateStation(station, required = false) {
  exact(station, ['id', 'handle', 'postmark'], 'Your station');
  id(station.id, 'station', 'Station ID');
  textValue(station.handle, LIMITS.handle, 'Your handle', {empty: !required});
  textValue(station.postmark, LIMITS.postmark, 'Your optional postmark', {empty: true});
  if (required && !station.handle.trim()) fail('Choose your handle before writing, accepting new mail, or packing a bag.');
}

export function newDesk() {
  return {
    schemaVersion: 4,
    station: {id: uid('station'), handle: '', postmark: ''},
    messages: [], routes: [], seenBags: {}, drafts: {post: '', replies: {}},
    selected: [], preferences: {theme: 'day'}, local: newLocal(),
  };
}

/** The small draft validator is also used by the storage layer's guarded draft patch. */
export function validateDrafts(value) {
  rejectUnsafe(value);
  exact(value, ['post', 'replies'], 'Private drafts');
  textValue(value.post, LIMITS.body, 'Private postcard draft', {empty: true, multiline: true});
  object(value.replies, 'Private reply drafts');
  if (Object.keys(value.replies).length > LIMITS.messages) fail('This desk has too many private reply drafts.');
  for (const [key, draft] of Object.entries(value.replies)) {
    id(key, 'msg', 'Reply draft parent ID');
    textValue(draft, LIMITS.body, 'Private reply draft', {empty: true, multiline: true});
  }
  return clone(value);
}

function messageIds(value, label) {
  array(value, LIMITS.messages, label);
  for (const key of value) id(key, 'msg', label);
  return [...new Set(value)];
}

const arrivalReferences = arrival => arrival.newMessageIds.length + arrival.messageIds.length + 2 * arrival.pathReceipts.length;
const outboxReferences = receipt => receipt.messageIds.length + 2 * receipt.pathHeads.length;

// Index the immutable predecessor graph once. Prefix byte sizes and tree
// intervals let receipt validation check old packed copies without repeatedly
// materializing every historical bag. Sorted preorder matches routeKey order.
function indexRecordedPaths(marks) {
  const nodes = new Map([...marks].map(([key, binding]) => [key, {...binding, children: []}]));
  const roots = [];
  for (const node of nodes.values()) {
    if (node.previousId) nodes.get(node.previousId).children.push(node);
    else roots.push(node);
  }
  roots.sort((a, b) => a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0);
  for (const node of nodes.values()) node.children.sort((a, b) => a.mark.id < b.mark.id ? -1 : a.mark.id > b.mark.id ? 1 : 0);
  let order = 0;
  const stack = roots.map(node => ({node, leaving: false})).reverse();
  while (stack.length) {
    const {node, leaving} = stack.pop();
    if (leaving) { node.end = order; continue; }
    const previous = node.previousId ? nodes.get(node.previousId) : null;
    node.start = order++;
    node.steps = (previous?.steps || 0) + 1;
    node.pathBytes = (previous ? previous.pathBytes + 1 : 2) + bytes(JSON.stringify(node.mark));
    node.routeBytes = bytes(JSON.stringify({messageId: node.messageId, path: []})) - 2 + node.pathBytes;
    stack.push({node, leaving: true});
    for (let i = node.children.length - 1; i >= 0; i--) stack.push({node: node.children[i], leaving: false});
  }
  return nodes;
}

function validateOutbox(value, desk, messages, marks) {
  array(value, LIMITS.outbox, 'Packed mailbags');
  if (!value.length) return;
  const paths = indexRecordedPaths(marks);
  const messageBytes = new Map([...messages].map(([key, message]) => [key, bytes(JSON.stringify(message))]));
  let references = 0;
  const bagIds = new Set(), usedHeads = new Set();
  for (const receipt of value) {
    exact(receipt, ['bagId', 'packedAt', 'messageIds', 'pathHeads'], 'A packing receipt');
    id(receipt.bagId, 'bag', 'Packed bag ID');
    date(receipt.packedAt, 'Packed bag time');
    if (bagIds.has(receipt.bagId)) fail('The outbox repeats a packed bag ID.');
    bagIds.add(receipt.bagId);
    const ids = messageIds(receipt.messageIds, 'Packed message IDs');
    if (!ids.length || ids.length !== receipt.messageIds.length) fail('A packing receipt has empty or repeated message references.');
    for (let i = 0; i < ids.length; i++) {
      if (!messages.has(ids[i])) fail('A packing receipt refers to a message that is not on this desk.');
      if (i && ids[i - 1] >= ids[i]) fail('Packed message references are not in their recorded canonical order.');
    }
    const offered = new Set(ids), covered = new Set();
    array(receipt.pathHeads, LIMITS.routes, 'Packed path heads');
    if (!receipt.pathHeads.length) fail('A packing receipt is missing its recorded paths.');
    let previous = null, steps = 0;
    let fileBytes = bytes(jsonFile({format: MAILBAG_FORMAT, version: 1, id: receipt.bagId, packedAt: receipt.packedAt, messages: [], routes: []}));
    fileBytes += ids.reduce((total, key) => total + messageBytes.get(key), 0) + ids.length - 1;
    for (const head of receipt.pathHeads) {
      exact(head, ['messageId', 'markId'], 'A packed path head');
      id(head.messageId, 'msg', 'Packed path message ID');
      id(head.markId, 'mark', 'Packed postmark ID');
      const path = paths.get(head.markId);
      if (!offered.has(head.messageId) || !path || path.messageId !== head.messageId || path.mark.kind !== 'packed' || path.mark.stationId !== desk.station.id || path.mark.at !== receipt.packedAt) fail('A packing receipt does not match its recorded local packed postmark.');
      if (usedHeads.has(head.markId)) fail('An outbox packed postmark is assigned to more than one recorded path or bag.');
      usedHeads.add(head.markId);
      if (previous && previous.start >= path.start) fail('Packed paths are repeated or not in their recorded canonical order.');
      if (previous && previous.end > path.start) fail('A packing receipt contains both a path and its continuation.');
      previous = path;
      covered.add(head.messageId);
      steps += path.steps;
      fileBytes += path.routeBytes;
    }
    for (const key of ids) if (!covered.has(key)) fail('A packed message is missing its recorded path.');
    fileBytes += receipt.pathHeads.length - 1;
    if (steps > LIMITS.totalSteps) fail('A recorded packed bag exceeds the supported postmark limit.');
    if (fileBytes > LIMITS.fileBytes) fail('A recorded packed bag exceeds the 5 MiB mailbag limit.');
    references += outboxReferences(receipt);
    if (references > LIMITS.outboxReferences) fail('The outbox exceeds its reference limit.');
  }
}

function validateLocal(value, desk, messages, marks) {
  const keys = ['readMessageIds', 'bookmarkedThreadIds', 'archivedThreadIds', 'followedThreadIds', 'lastBackupAt', 'arrivals'];
  exact(value, [...keys, ...(desk.schemaVersion >= 3 ? ['outbox'] : []), ...(desk.schemaVersion >= 4 ? ['readingPositions'] : [])], 'Private desk notes');
  const out = clone(value);
  out.readMessageIds = messageIds(value.readMessageIds, 'Read message IDs');
  for (const key of out.readMessageIds) if (!messages.has(key)) fail('A read marker refers to a message that is not on this desk.');
  const threads = groupThreads(desk);
  const threadFor = new Map();
  for (const thread of threads) {
    threadFor.set(thread.id, thread.id);
    for (const message of thread.messages) threadFor.set(message.id, thread.id);
  }
  for (const key of Object.values(FLAG_KEYS)) {
    const ids = messageIds(value[key], 'Private thread IDs');
    for (const threadId of ids) if (!threadFor.has(threadId)) fail('A private thread flag refers to a thread that is not on this desk.');
    // A formerly missing ancestor can now be a reply in a larger thread.
    out[key] = [...new Set(ids.map(threadId => threadFor.get(threadId)))];
  }
  if (value.lastBackupAt !== null) date(value.lastBackupAt, 'Last backup download time');
  array(value.arrivals, LIMITS.arrivals, 'Recent mailbag arrivals');
  let references = 0;
  const seen = new Set();
  for (const arrival of value.arrivals) {
    exact(arrival, ['bagId', 'receivedAt', 'newMessageIds', 'messageIds', 'pathReceipts'], 'A mailbag arrival');
    id(arrival.bagId, 'bag', 'Arrival bag ID'); date(arrival.receivedAt, 'Arrival time');
    if (seen.has(arrival.bagId)) fail('The local arrival list repeats a bag ID.');
    if (!own(desk.seenBags, arrival.bagId)) fail('A local arrival is missing its opened-bag receipt.');
    seen.add(arrival.bagId);
    const all = messageIds(arrival.messageIds, 'Arrival message IDs');
    const fresh = messageIds(arrival.newMessageIds, 'New arrival message IDs');
    if (!all.length || all.length !== arrival.messageIds.length || fresh.length !== arrival.newMessageIds.length) fail('A local arrival has empty or repeated message references.');
    const offered = new Set(all);
    for (const key of all) if (!messages.has(key)) fail('A local arrival refers to a message that is not on this desk.');
    for (const key of fresh) if (!offered.has(key)) fail('A new arrival message is missing from its bag summary.');
    array(arrival.pathReceipts, LIMITS.routes, 'Arrival path receipts');
    const receiptIds = new Set(), covered = new Set();
    for (const receipt of arrival.pathReceipts) {
      exact(receipt, ['messageId', 'markId'], 'An arrival path receipt');
      id(receipt.messageId, 'msg', 'Arrival message ID'); id(receipt.markId, 'mark', 'Arrival postmark ID');
      const binding = marks.get(receipt.markId);
      if (!offered.has(receipt.messageId) || !binding || binding.messageId !== receipt.messageId || binding.mark.kind !== 'received' || binding.mark.stationId !== desk.station.id || binding.mark.at !== arrival.receivedAt) fail('A local arrival does not match its recorded received postmark.');
      if (receiptIds.has(receipt.markId)) fail('A local arrival repeats a received postmark.');
      receiptIds.add(receipt.markId); covered.add(receipt.messageId);
    }
    for (const key of all) if (!covered.has(key)) fail('A local arrival message is missing its received postmark.');
    references += arrivalReferences(arrival);
    if (references > LIMITS.arrivalReferences) fail('The local arrival list exceeds its reference limit.');
  }
  out.outbox = desk.schemaVersion >= 3 ? clone(value.outbox) : [];
  validateOutbox(out.outbox, desk, messages, marks);
  const positions = desk.schemaVersion >= 4 ? messageIds(value.readingPositions, 'Reading positions') : [];
  if (desk.schemaVersion >= 4 && positions.length !== value.readingPositions.length) fail('Reading positions repeat a postcard ID.');
  const latest = new Map();
  for (const messageId of positions) {
    if (!messages.has(messageId)) fail('A reading position refers to a postcard that is not on this desk.');
    const threadId = threadFor.get(messageId);
    // Stable message anchors survive a late parent. If two threads join,
    // retain the last explicitly visited anchor by append order, not a clock.
    latest.delete(threadId);
    latest.set(threadId, messageId);
  }
  out.readingPositions = [...latest.values()];
  return out;
}

/**
 * Exact counts for the existing capacity controls. This observes a normalized
 * desk without mutation or an export; backupBytes includes the reserved backup
 * timestamp used by assertDeskCapacity, not the browser's storage quota.
 */
export function deskCapacity(desk) {
  let totalSteps = 0, longestPath = 0;
  for (const route of desk.routes) {
    totalSteps += route.path.length;
    longestPath = Math.max(longestPath, route.path.length);
  }
  return {messages: desk.messages.length, routes: desk.routes.length, totalSteps, longestPath,
    receivedBags: Object.keys(desk.seenBags).length, backupBytes: reservedBackupBytes(desk),
    arrivals: desk.local.arrivals.length, outbox: desk.local.outbox.length};
}

function reservedBackupBytes(desk) {
  const candidate = desk.schemaVersion >= 2 && desk.local
    ? {...desk, local: {...desk.local, lastBackupAt: CAPACITY_DATE}} : desk;
  const envelope = {format: BACKUP_FORMAT, version: 4, exportedAt: CAPACITY_DATE, desk: candidate};
  return bytes(jsonFile(envelope));
}

/** Check a structurally validated candidate before committing it, including draft-only patches. */
export function assertDeskCapacity(desk) {
  // Reserve the timestamp even before the first backup, so recording a download
  // start cannot itself make an otherwise valid desk impossible to back up.
  if (reservedBackupBytes(desk) > LIMITS.backupBytes) fail('This desk would exceed the 20 MiB full-backup limit. Nothing was changed. Keep additional mail on a separate desk.');
}

/** Validate without mutating, returning a detached, normalized copy. */
export function validateDesk(value) {
  rejectUnsafe(value);
  object(value, 'A desk');
  if (![1, 2, 3, 4].includes(value.schemaVersion)) fail('This desk uses an unsupported version. Your saved desk was not replaced.');
  const keys = ['schemaVersion', 'station', 'messages', 'routes', 'seenBags', 'drafts', 'selected', 'preferences'];
  exact(value, value.schemaVersion >= 2 ? [...keys, 'local'] : keys, 'A desk');
  validateStation(value.station);
  const messages = validateMessages(value.messages);
  const {marks} = validateRoutes(value.routes, messages);
  object(value.seenBags, 'Opened-bag receipts');
  if (Object.keys(value.seenBags).length > LIMITS.receipts) fail('This desk has too many opened-bag receipts for this version.');
  for (const [key, hash] of Object.entries(value.seenBags)) {
    id(key, 'bag', 'Opened-bag ID');
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) fail('An opened-bag receipt is damaged.');
  }
  validateDrafts(value.drafts);
  array(value.selected, LIMITS.messages, 'Selected threads');
  for (const key of value.selected) id(key, 'msg', 'Selected thread ID');
  exact(value.preferences, ['theme'], 'Local preferences');
  if (!['day', 'night', 'contrast'].includes(value.preferences.theme)) fail('The saved color mode is unsupported.');
  const out = clone(value);
  out.schemaVersion = 4;
  out.local = value.schemaVersion === 1 ? {...newLocal(), readMessageIds: [...messages.keys()]} : validateLocal(value.local, value, messages, marks);
  out.routes = maximalRoutes(out.routes);
  out.selected = [...new Set(out.selected)];
  assertDeskCapacity(out);
  return out;
}

function stamp(station, kind, at = now()) {
  return {id: uid('mark'), stationId: station.id, handle: station.handle.trim(), postmark: station.postmark.trim(), kind, at};
}

export function createMessage(desk, {body, parentId = null}) {
  const next = validateDesk(desk);
  validateStation(next.station, true);
  textValue(body, LIMITS.body, 'Postcard text', {multiline: true});
  if (parentId !== null) id(parentId, 'msg', 'Reply parent ID');
  const message = {id: uid('msg'), parentId, handle: next.station.handle.trim(), body: body.trim(), createdAt: now()};
  next.messages.push(message);
  next.routes.push({messageId: message.id, path: [stamp(next.station, 'written', message.createdAt)]});
  next.local.readMessageIds.push(message.id);
  if (parentId) delete next.drafts.replies[parentId]; else next.drafts.post = '';
  return {desk: validateDesk(next), message: clone(message)};
}

/** Parentage determines thread membership and display order, never station clocks. */
export function groupThreads(desk) {
  const map = new Map(desk.messages.map(m => [m.id, m]));
  const groups = new Map(), targets = new Map();
  for (const m of desk.messages) {
    let cursor = m, target;
    const chain = [];
    while (true) {
      if (targets.has(cursor.id)) { target = targets.get(cursor.id); break; }
      chain.push(cursor.id);
      if (!cursor.parentId) { target = {id: cursor.id, root: cursor, missingParentId: null}; break; }
      if (!map.has(cursor.parentId)) { target = {id: cursor.parentId, root: null, missingParentId: cursor.parentId}; break; }
      cursor = map.get(cursor.parentId);
      if (chain.length > desk.messages.length) fail('A circular reply chain cannot be displayed.');
    }
    for (const key of chain) targets.set(key, target);
    if (!groups.has(target.id)) groups.set(target.id, {...target, messages: []});
    groups.get(target.id).messages.push(m);
  }
  for (const group of groups.values()) {
    const children = new Map();
    for (const m of group.messages) {
      const parent = m.parentId ?? '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(m);
    }
    const ordered = [], stack = [...(group.root ? [group.root] : children.get(group.missingParentId) ?? [])].reverse();
    while (stack.length) {
      const m = stack.pop(); ordered.push(m);
      for (const child of [...(children.get(m.id) ?? [])].reverse()) stack.push(child);
    }
    group.messages = ordered;
  }
  return [...groups.values()];
}

/** Read state belongs to message IDs on this desk, never to a supplied handle. */
export function markMessagesRead(desk, ids, read = true) {
  const next = validateDesk(desk);
  if (typeof read !== 'boolean') fail('A read marker must be on or off.');
  const requested = messageIds(ids, 'Read message IDs');
  const present = new Set(next.messages.map(message => message.id));
  const marked = new Set(next.local.readMessageIds);
  for (const key of requested) {
    if (!present.has(key)) fail('Only messages already on this desk can be marked read or unread.');
    if (read) marked.add(key); else marked.delete(key);
  }
  next.local.readMessageIds = [...marked];
  return validateDesk(next);
}

/** Explicitly read one exposed section and remember its stable message anchor. */
export function recordReading(desk, options) {
  exact(options, ['messageIds', 'anchorId'], 'A reading action');
  const next = validateDesk(desk);
  const exposed = messageIds(options.messageIds, 'Displayed postcard IDs');
  if (!exposed.length || exposed.length !== options.messageIds.length) fail('A reading action needs a nonempty, unrepeated list of displayed postcards.');
  id(options.anchorId, 'msg', 'Reading position');
  if (!exposed.includes(options.anchorId)) fail('The reading position must be one of the displayed postcards.');
  const index = createDeskIndex(next);
  if (!index.messagesById.has(options.anchorId)) fail('Only postcards already on this desk can be remembered as a reading position.');
  const thread = index.messageToThread.get(options.anchorId);
  for (const messageId of exposed) {
    if (!index.messagesById.has(messageId)) fail('Only postcards already on this desk can be marked read.');
    if (index.messageToThread.get(messageId).id !== thread.id) fail('A reading action must stay within one conversation.');
  }
  const marked = new Set(next.local.readMessageIds);
  for (const messageId of exposed) marked.add(messageId);
  next.local.readMessageIds = [...marked];
  next.local.readingPositions = next.local.readingPositions.filter(messageId => index.messageToThread.get(messageId).id !== thread.id);
  next.local.readingPositions.push(options.anchorId);
  return validateDesk(next);
}

export function setThreadFlag(desk, threadId, flag, enabled) {
  const next = validateDesk(desk);
  id(threadId, 'msg', 'Thread ID');
  if (!own(FLAG_KEYS, flag)) fail('Choose bookmarked, archived, or followed for a private thread flag.');
  if (typeof enabled !== 'boolean') fail('A thread flag must be on or off.');
  const thread = groupThreads(next).find(t => t.id === threadId || t.messages.some(message => message.id === threadId));
  if (!thread) fail('That thread is not on this desk.');
  const key = FLAG_KEYS[flag], values = new Set(next.local[key]);
  if (enabled) values.add(thread.id); else values.delete(thread.id);
  next.local[key] = [...values];
  return validateDesk(next);
}

/**
 * Read-only derived lookups for one normalized desk snapshot. Build once when
 * that snapshot changes and reuse across tray rows. Nothing is persisted or
 * cached globally: mutable callers must create a new index after an edit.
 * searchTextByThread holds one string per postcard, preserving search boundaries.
 */
export function createDeskIndex(desk) {
  const threads = groupThreads(desk), threadById = new Map(), messageToThread = new Map();
  const messagesById = new Map(desk.messages.map(message => [message.id, message]));
  const routesByMessage = new Map(), originByMessage = new Map(), searchTextByThread = new Map();
  for (const route of desk.routes) {
    if (!routesByMessage.has(route.messageId)) routesByMessage.set(route.messageId, []);
    routesByMessage.get(route.messageId).push(route);
    if (!originByMessage.has(route.messageId)) originByMessage.set(route.messageId, route.path[0].stationId);
  }
  for (const thread of threads) {
    threadById.set(thread.id, thread);
    messageToThread.set(thread.id, thread);
    const text = [];
    for (const message of thread.messages) {
      messageToThread.set(message.id, thread);
      text.push(`${message.body} ${message.handle}`.toLocaleLowerCase());
    }
    searchTextByThread.set(thread.id, text);
  }
  const latestReceiptByThread = new Map(), receiptContents = new Map(), readingPositionByThread = new Map();
  for (const receipt of desk.local.outbox) {
    receiptContents.set(receipt.bagId, {messageIds: new Set(receipt.messageIds),
      pathHeads: new Set(receipt.pathHeads.map(head => head.markId))});
    for (const key of receipt.messageIds) {
      const thread = messageToThread.get(key);
      if (thread) latestReceiptByThread.set(thread.id, receipt);
    }
  }
  for (const messageId of desk.local.readingPositions) {
    const thread = messageToThread.get(messageId);
    if (thread) readingPositionByThread.set(thread.id, messageId);
  }
  return {desk, threads, threadById, messageToThread, messagesById, routesByMessage,
    originByMessage, searchTextByThread, latestReceiptByThread, receiptContents, readingPositionByThread,
    read: new Set(desk.local.readMessageIds), carried: new Set(desk.selected),
    bookmarked: new Set(desk.local.bookmarkedThreadIds), archived: new Set(desk.local.archivedThreadIds),
    followed: new Set(desk.local.followedThreadIds)};
}

function checkIndex(desk, index) {
  if (index && index.desk !== desk) fail('This tray index belongs to an earlier desk. Rebuild it after the desk changes.');
}

/** First unread follows causal display order; resume uses a private message ID. */
export function readingFacts(desk, thread, index = null) {
  checkIndex(desk, index);
  const read = index?.read || new Set(desk.local.readMessageIds);
  let firstUnreadId = null, unreadCount = 0;
  for (const message of thread.messages) {
    if (!read.has(message.id)) {
      firstUnreadId ??= message.id;
      unreadCount++;
    }
  }
  let resumeId = index?.readingPositionByThread.get(thread.id) || null;
  if (!index) {
    const present = new Set(thread.messages.map(message => message.id));
    resumeId = desk.local.readingPositions.findLast(messageId => present.has(messageId)) || null;
  }
  return {firstUnreadId, resumeId, unreadCount};
}

export function threadFacts(desk, thread, index = null) {
  checkIndex(desk, index);
  const read = index?.read || new Set(desk.local.readMessageIds);
  const authoredHere = index
    ? message => index.originByMessage.get(message.id) === desk.station.id
    : message => desk.routes.find(route => route.messageId === message.id)?.path[0].stationId === desk.station.id;
  const isFollowed = index ? index.followed.has(thread.id) : desk.local.followedThreadIds.includes(thread.id);
  const participates = thread.messages.some(authoredHere);
  return {
    unreadCount: thread.messages.filter(message => !read.has(message.id)).length,
    isMine: Boolean(thread.root && authoredHere(thread.root)),
    hasNewReplies: (participates || isFollowed) && thread.messages.some(message => message.parentId !== null && !read.has(message.id) && !authoredHere(message)),
    isCarrying: index ? index.carried.has(thread.id) : desk.selected.includes(thread.id),
    isBookmarked: index ? index.bookmarked.has(thread.id) : desk.local.bookmarkedThreadIds.includes(thread.id),
    isArchived: index ? index.archived.has(thread.id) : desk.local.archivedThreadIds.includes(thread.id),
    isFollowed,
  };
}

/** The timestamp records a download starting, not confirmation that a file reached disk. */
export function markBackupStarted(desk, at = now()) {
  const next = validateDesk(desk);
  date(at, 'Backup download start time');
  next.local.lastBackupAt = at;
  return validateDesk(next);
}

function validateBag(value) {
  rejectUnsafe(value);
  object(value, 'A mailbag');
  if (value.format === BACKUP_FORMAT) fail('This is a full-desk backup. Use Restore desk in Desk tools instead of Open a mailbag.');
  if (value.format !== MAILBAG_FORMAT) fail('This file is not a Sneakernet Social Club mailbag. Your desk has not changed.');
  if (value.version !== 1) fail(`This mailbag uses version ${String(value.version).slice(0, 16)}. This app opens version 1. Your desk has not changed.`);
  exact(value, ['format', 'version', 'id', 'packedAt', 'messages', 'routes'], 'A mailbag');
  id(value.id, 'bag', 'Mailbag ID'); date(value.packedAt, 'Packing time');
  const messages = validateMessages(value.messages);
  if (!messages.size) fail('This mailbag is empty. Choose a file containing at least one postcard or reply.');
  validateRoutes(value.routes, messages);
  const bag = clone(value);
  bag.routes = maximalRoutes(bag.routes);
  bag.messages.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (bytes(jsonFile(bag)) > LIMITS.fileBytes) fail('This mailbag is larger than 5 MiB. Choose fewer threads before packing.');
  return bag;
}

/** The exact portable UTF-8 content, including its final newline, is size-checked. */
export function serializeMailbag(bag) {
  return `${canonical(validateBag(bag))}\n`;
}

/** Prepare a frozen public preview and the state to commit only on download. */
export function prepareMailbag(desk, threadIds = desk.selected) {
  const next = validateDesk(desk);
  validateStation(next.station, true);
  const selected = new Set(threadIds);
  const chosen = groupThreads(next).filter(t => selected.has(t.id));
  if (!chosen.length) fail('Select at least one thread you are willing to carry.');
  const messageIds = new Set(chosen.flatMap(t => t.messages.map(m => m.id)));
  const packedAt = now();
  const outgoing = next.routes.filter(r => messageIds.has(r.messageId)).map(r => ({
    messageId: r.messageId, path: [...r.path, stamp(next.station, 'packed', packedAt)],
  }));
  const bag = validateBag({format: MAILBAG_FORMAT, version: 1, id: uid('bag'), packedAt,
    messages: next.messages.filter(m => messageIds.has(m.id)), routes: outgoing});
  next.routes = maximalRoutes([...next.routes, ...outgoing]);
  next.local.outbox.push({
    bagId: bag.id, packedAt,
    messageIds: bag.messages.map(message => message.id),
    pathHeads: bag.routes.map(route => ({messageId: route.messageId, markId: route.path.at(-1).id})),
  });
  let references = next.local.outbox.reduce((total, receipt) => total + outboxReferences(receipt), 0);
  while (next.local.outbox.length > LIMITS.outbox || references > LIMITS.outboxReferences) {
    references -= outboxReferences(next.local.outbox.shift());
  }
  return {bag, desk: validateDesk(next)};
}

/** Rebuild one recorded public envelope, without adding a stamp or a receipt. */
export function rebuildMailbag(desk, bagId) {
  const checked = validateDesk(desk);
  id(bagId, 'bag', 'Packed bag ID');
  const receipt = checked.local.outbox.find(entry => entry.bagId === bagId);
  if (!receipt) fail('That packing receipt is not in this outbox. It may have aged out; your postcards and recorded paths remain on the desk.');
  const messages = new Map(checked.messages.map(message => [message.id, message]));
  const wanted = new Set(receipt.pathHeads.map(head => head.markId)), prefixes = new Map();
  for (const route of checked.routes) {
    for (let i = 0; i < route.path.length; i++) {
      const key = route.path[i].id;
      if (wanted.has(key) && !prefixes.has(key)) prefixes.set(key, {messageId: route.messageId, path: route.path.slice(0, i + 1)});
    }
  }
  return validateBag({format: MAILBAG_FORMAT, version: 1, id: receipt.bagId, packedAt: receipt.packedAt,
    messages: receipt.messageIds.map(key => messages.get(key)), routes: receipt.pathHeads.map(head => prefixes.get(head.markId))});
}

/**
 * Compare a live normalized thread with its latest intersecting packing
 * receipt. This deliberately avoids full desk validation for every tray row.
 * "New" means absent from that recorded packing, not never carried anywhere.
 */
export function packingFacts(desk, thread, index = null) {
  checkIndex(desk, index);
  const currentIds = new Set(thread.messages.map(message => message.id));
  const routes = index
    ? thread.messages.flatMap(message => index.routesByMessage.get(message.id) || [])
    : desk.routes.filter(route => currentIds.has(route.messageId));
  let receipt = index?.latestReceiptByThread.get(thread.id) || null;
  if (!index) for (let i = desk.local.outbox.length - 1; i >= 0; i--) {
    if (desk.local.outbox[i].messageIds.some(key => currentIds.has(key))) { receipt = desk.local.outbox[i]; break; }
  }
  const contents = receipt && index?.receiptContents.get(receipt.bagId);
  const packedIds = contents ? contents.messageIds : new Set(receipt?.messageIds || []);
  const packedHeads = contents ? contents.pathHeads : new Set(receipt?.pathHeads.map(head => head.markId) || []);
  const newMessageCount = thread.messages.filter(message => !packedIds.has(message.id)).length;
  // Immutable predecessor bindings mean a matching terminal mark represents
  // exactly the same complete path. An extension has a different terminal mark.
  const newPathCount = routes.filter(route => !packedHeads.has(route.path.at(-1).id)).length;
  return {lastBagId: receipt?.bagId || null, lastPackedAt: receipt?.packedAt || null,
    hasReceipt: Boolean(receipt), newMessageCount, newPathCount, hasChanges: newMessageCount > 0 || newPathCount > 0};
}

async function fingerprint(bag) {
  if (!globalThis.crypto?.subtle) fail('This browser cannot verify mailbag receipts. Use a current browser on HTTPS or localhost.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(bag)));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function mergePublic(desk, bag) {
  const messageMap = new Map(desk.messages.map(m => [m.id, m]));
  const newMessages = [], existingMessages = [];
  for (const incoming of bag.messages) {
    const old = messageMap.get(incoming.id);
    if (old) {
      if (!sameMessage(old, incoming)) fail('An existing message ID has different text, author, time, or parent in this file. Nothing was imported.');
      existingMessages.push(incoming);
    } else { newMessages.push(incoming); messageMap.set(incoming.id, incoming); }
  }
  assertNoCycles(messageMap);
  // Validate the union before pruning prefixes: immutable event IDs must agree everywhere.
  validateRoutes([...desk.routes, ...bag.routes], messageMap, {union: true});
  // An unseen envelope is another accepted copy, even when its history is a
  // known prefix. Appending a receipt preserves a direct A→C path after A→B→C.
  // Only the opened-bag ledger makes an identical envelope a strict no-op.
  const newRoutes = bag.routes;
  return {messageMap, newMessages, existingMessages, newRoutes};
}

async function inspect(desk, candidate) {
  const bag = validateBag(candidate);
  const merged = mergePublic(desk, bag);
  const hash = await fingerprint(bag);
  const previous = desk.seenBags[bag.id];
  if (previous && previous !== hash) fail('This bag ID was opened before, but its contents have changed. Nothing was imported. Ask the sender to pack a new bag.');
  const alreadyOpened = Boolean(previous);
  const counts = {
    newPosts: merged.newMessages.filter(m => m.parentId === null).length,
    newReplies: merged.newMessages.filter(m => m.parentId !== null).length,
    seenMessages: merged.existingMessages.length,
    newPaths: alreadyOpened ? 0 : merged.newRoutes.length,
  };
  return {bag, hash, alreadyOpened, counts, ...merged};
}

export async function previewMailbag(desk, rawText) {
  const checked = validateDesk(desk);
  const result = await inspect(checked, parseJSON(rawText, LIMITS.fileBytes, 'mailbag'));
  return {bag: result.bag, alreadyOpened: result.alreadyOpened, counts: result.counts,
    newMessages: clone(result.newMessages), existingMessages: clone(result.existingMessages)};
}

export async function acceptMailbag(desk, bag) {
  const next = validateDesk(desk);
  const result = await inspect(next, bag);
  const summary = {...result.counts, alreadyOpened: result.alreadyOpened};
  if (result.alreadyOpened) return {desk, summary};
  // Every first acceptance records the supplied copy at this station.
  if (result.newRoutes.length || result.newMessages.length) validateStation(next.station, true);
  const selectedMessages = new Set(groupThreads(next).filter(t => next.selected.includes(t.id)).flatMap(t => t.messages.map(m => m.id)));
  next.messages.push(...clone(result.newMessages));
  const receivedAt = now();
  const received = result.newRoutes.map(r => ({messageId: r.messageId,
    path: [...r.path, stamp(next.station, 'received', receivedAt)]}));
  next.routes = maximalRoutes([...next.routes, ...received]);
  next.seenBags[result.bag.id] = result.hash;
  next.selected = groupThreads(next).filter(t => t.messages.some(m => selectedMessages.has(m.id))).map(t => t.id);
  next.local.arrivals.push({
    bagId: result.bag.id, receivedAt,
    newMessageIds: result.newMessages.map(message => message.id),
    messageIds: result.bag.messages.map(message => message.id),
    pathReceipts: received.map(route => ({messageId: route.messageId, markId: route.path.at(-1).id})),
  });
  // Only this private convenience history is bounded by recency. Public messages,
  // all known paths, and the replay ledger are never truncated to make room.
  let references = next.local.arrivals.reduce((total, arrival) => total + arrivalReferences(arrival), 0);
  while (next.local.arrivals.length > LIMITS.arrivals || references > LIMITS.arrivalReferences) {
    references -= arrivalReferences(next.local.arrivals.shift());
  }
  return {desk: validateDesk(next), summary};
}

export function makeBackup(desk) {
  const backup = {format: BACKUP_FORMAT, version: 4, exportedAt: now(), desk: validateDesk(desk)};
  if (bytes(jsonFile(backup)) > LIMITS.backupBytes) fail('This full-desk backup is larger than 20 MiB. Nothing was changed.');
  return backup;
}

/** Serialize a desk, not an already wrapped backup; private backup writes use version 4. */
export function serializeBackup(desk) {
  return jsonFile(makeBackup(desk));
}

export function parseBackup(rawText) {
  const value = parseJSON(rawText, LIMITS.backupBytes, 'desk backup');
  object(value, 'A desk backup');
  if (value.format === MAILBAG_FORMAT) fail('This is a public mailbag. Use Open a mailbag instead of Restore desk.');
  if (value.format !== BACKUP_FORMAT) fail('This file is not a Sneakernet Social Club full-desk backup. Nothing was changed.');
  if (![1, 2, 3, 4].includes(value.version)) fail('This backup uses an unsupported version. This app restores versions 1, 2, 3, and 4. Your current desk was not replaced.');
  exact(value, ['format', 'version', 'exportedAt', 'desk'], 'A desk backup');
  date(value.exportedAt, 'Backup time');
  if (value.desk?.schemaVersion !== value.version) fail('This backup version does not match its desk schema. Your current desk was not replaced.');
  return validateDesk(value.desk);
}
