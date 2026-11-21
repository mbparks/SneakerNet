/**
 * NODE CONTROLLER SCHEDULING SIMULATION — NOT BROWSER ACCEPTANCE.
 *
 * Loads the actual app.js controller functions and actual desk/reader models.
 * Only module wiring, boot, rendering, document objects, and storage completion
 * are adapted. The adapter observes repaint/focus requests; it cannot establish
 * native focus, layout, IndexedDB durability, or browser event ordering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import * as core from '../src/core.js';
import * as reader from '../src/reader.js';

console.log('Node controller scheduling simulation. NOT browser acceptance.');

const appURL = new URL('../src/app.js', import.meta.url);
const original = readFileSync(appURL, 'utf8');
assert.match(original, /^boot\(\)\.catch\(.+\);$/m, 'The test must disable the actual boot call explicitly');
const executable = original
  .replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, path) => `const {${names}} = modules[${JSON.stringify(path)}];`)
  .replaceAll('import.meta.url', JSON.stringify(appURL.href))
  .replace(/^boot\(\)\.catch\(.+\);$/m, '');

// compileFunction uses this realm, so the real model's strict JSON-object
// checks see normal objects. The actual controller bodies are never copied.
const loadController = compileFunction(`
  const { document, Node, requestAnimationFrame, setTimeout, clearTimeout } = environment;
  ${executable}
  tell = (message, type = 'success') => environment.notices.push({message, type});
  saveStatus = () => {};
  updatePrivateSummary = () => {};
  renderDesk = () => {
    const anchor = readerAnchor;
    environment.renders.push({desk, anchor, selectedThread, request: readingRequest});
    readerView = {focusAnchor: () => environment.focusAnchor(anchor)};
  };
  desk = validateDesk(environment.initial);
  return {
    navigateReader, markRead, commit, settle, compose, openModal, closeModal,
    resetReader, renderDesk, captureDeskFocus,
    select(threadId, anchorId) { selectedThread = threadId; readerAnchor = anchorId; },
    renderedThread(threadId) { readerThread = threadId; },
    state() { return {desk, revision, selectedThread, readerAnchor, readingRequest,
      parentReturns: [...parentReturns], queuedWrites, saveFailure}; }
  };
`, ['modules', 'environment'], {filename: appURL.pathname});

class Element {
  constructor(document, tag) {
    this.document = document; this.tag = tag; this.children = []; this.attrs = {};
    this.listeners = new Map(); this.dataset = {}; this.disabled = false;
    this.open = false; this.closeCount = 0;
    this.classList = {toggle() {}};
  }
  append(...nodes) {
    for (const node of nodes) { this.children.push(node); node.parent = this; }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = []; this.append(...nodes);
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === 'id') this.id = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { return this.listeners.get(type)?.({preventDefault() {}, ...event}); }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  matches(selector) {
    const parts = selector.split(' ');
    if (parts.length === 2) return this.matches(parts[1]) && Boolean(this.parent?.closest(parts[0]));
    if (selector.startsWith('.')) return (this.className || this.attrs.class || '').split(' ').includes(selector.slice(1));
    const attribute = /^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attribute) return (!attribute[1] || this.tag === attribute[1]) && this.hasAttribute(attribute[2]) && (attribute[3] === undefined || this.getAttribute(attribute[2]) === attribute[3]);
    return this.tag === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
  querySelectorAll(selector) { return descendants(this).filter((node) => node.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.closeCount++; }
  get isConnected() { return this.document.body.contains(this); }
  get textContent() { return this.text || this.children.map((node) => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
}
const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);

function documentAdapter() {
  const document = {
    createElement(tag) { return new Element(document, tag); },
    createTextNode(text) { const node = this.createElement('#text'); node.textContent = text; return node; },
    getElementById(id) { return descendants(this.body).find((node) => node.id === id) || null; },
  };
  document.body = document.createElement('body');
  document.activeElement = document.body;
  for (const id of ['modal', 'search', 'reader', 'board', 'view-filter']) {
    const node = document.createElement(id === 'modal' ? 'dialog' : 'div');
    node.setAttribute('id', id); document.body.append(node);
  }
  for (const id of ['modal-body', 'modal-title', 'modal-close']) {
    const node = document.createElement('div'); node.setAttribute('id', id);
    document.getElementById('modal').append(node);
  }
  return document;
}

function scheduledStorage(initial) {
  let saved = structuredClone(initial), revision = 0, automatic = false;
  const attempts = [], committed = [], pending = [], started = [];
  function finish(operation, error = null) {
    if (error) { operation.reject(error); return; }
    if (operation.expected !== revision) { operation.reject(new Error('Simulated revision conflict')); return; }
    saved = structuredClone(operation.candidate); revision++;
    committed.push(saved); operation.resolve({revision});
  }
  return {
    attempts, committed,
    saveDesk(candidate, expected) {
      return new Promise((resolve, reject) => {
        const operation = {candidate: structuredClone(candidate), expected, resolve, reject};
        attempts.push(operation);
        if (automatic) queueMicrotask(() => finish(operation)); else pending.push(operation);
        for (const notify of started.splice(0)) notify();
      });
    },
    async waitForWrite() { if (!attempts.length) await new Promise((resolve) => started.push(resolve)); },
    resume(error = null) {
      automatic = true;
      for (const operation of pending.splice(0)) finish(operation, error);
    },
    saved() { return structuredClone(saved); },
  };
}

function fixture({read = false, savedPlace = false} = {}) {
  let desk = core.newDesk(); desk.station.handle = 'Controller station';
  const root = core.createMessage(desk, {body: 'A long conversation'}); desk = root.desk;
  for (let i = 1; i < 27; i++) desk = core.createMessage(desk, {body: `Reply ${i}`, parentId: root.message.id}).desk;
  const ids = core.groupThreads(desk)[0].messages.map((message) => message.id);
  if (!read) desk = core.markMessagesRead(desk, ids, false);
  if (savedPlace) desk = core.recordReading(desk, {messageIds: ids.slice(0, 12), anchorId: ids[0]});
  return {desk, ids, rootId: root.message.id};
}

function harness(initial) {
  const document = documentAdapter(), store = scheduledStorage(initial);
  const environment = {
    initial, document, Node: Element, notices: [], renders: [], focusCalls: [],
    setTimeout, clearTimeout, requestAnimationFrame: (callback) => callback(),
    focusAnchor(anchor) {
      environment.focusCalls.push(anchor);
      const target = document.createElement('article'); target.setAttribute('data-message-id', anchor);
      document.getElementById('reader').replaceChildren(target); target.focus();
    },
  };
  const api = loadController({
    './core.js': core,
    './reader.js': reader,
    './storage.js': {saveDesk: store.saveDesk, requestPersistence: async () => false},
    './experience.js': {}, './carrier.js': {}, './desk-view.js': {},
  }, environment);
  return {api, store, document, ...environment};
}

const check = (name, run) => test(`[Node controller simulation] ${name}`, {timeout: 5000}, run);

check('quick P → Q → P saves the last explicit visit while marking only the exposed sections', async () => {
  const {desk, ids} = fixture({savedPlace: true}), h = harness(desk);
  const toQ = h.api.navigateReader({anchorId: ids[12], reason: 'next'});
  await h.store.waitForWrite();
  const backToP = h.api.navigateReader({anchorId: ids[0], reason: 'previous'});
  assert.equal(h.api.state().readerAnchor, ids[0], 'The latest section opens before either save completes');
  h.store.resume(); await Promise.all([toQ, backToP]);
  assert.deepEqual(h.store.committed.map((snapshot) => snapshot.local.readingPositions.at(-1)), [ids[12], ids[0]]);
  assert.deepEqual(h.store.saved().local.readingPositions, [ids[0]]);
  assert.deepEqual(new Set(h.store.saved().local.readMessageIds), new Set(ids.slice(0, 24)));
  assert.equal(ids.slice(24).some((id) => h.store.saved().local.readMessageIds.includes(id)), false);
});

check('Mark all as unread followed by an explicit read follows queue order', async () => {
  const {desk, ids} = fixture({read: true}), h = harness(desk);
  const unread = h.api.markRead(ids, false);
  await h.store.waitForWrite();
  const reopen = h.api.markRead([ids[15]], true);
  h.store.resume(); await Promise.all([unread, reopen]);
  assert.equal(h.store.committed.length, 2, 'The later read cannot be discarded against the old snapshot');
  assert.deepEqual(h.store.saved().local.readMessageIds, [ids[15]]);
});

check('a superseded navigation still repaints committed counts in the current context', async () => {
  const data = fixture(), other = core.createMessage(data.desk, {body: 'Another conversation'});
  const h = harness(other.desk);
  const reading = h.api.navigateReader({anchorId: data.ids[12], reason: 'next'});
  await h.store.waitForWrite();
  h.api.resetReader(); h.api.select(other.message.id, other.message.id); h.api.renderDesk();
  const before = h.renders.length;
  h.store.resume(); await reading;
  assert.ok(h.renders.length > before, 'A stale navigation request still needs a repaint after its save');
  const latest = h.renders.at(-1);
  assert.equal(latest.selectedThread, other.message.id);
  assert.equal(latest.anchor, other.message.id, 'The old callback must not redirect the current reader');
  assert.equal(core.readingFacts(latest.desk, core.groupThreads(latest.desk).find((thread) => thread.id === data.rootId)).unreadCount, 15);
});

check('late completion does not request focus after it moved to search or another modal', async () => {
  for (const destination of ['search', 'modal']) {
    const {desk, ids} = fixture(), h = harness(desk);
    const reading = h.api.navigateReader({anchorId: ids[12], reason: 'next'});
    await h.store.waitForWrite();
    const control = destination === 'search' ? h.document.getElementById('search') : h.document.createElement('input');
    if (destination === 'modal') h.api.openModal('Another task', control);
    control.focus();
    const focusCalls = h.focusCalls.length;
    h.store.resume(); await reading;
    assert.equal(h.document.activeElement, control, `${destination} owns focus after the delayed save`);
    assert.equal(h.focusCalls.length, focusCalls, 'Completion must not issue another unconditional reader-focus request');
  }
});

check('posting from a closed composer preserves reading queued on both sides and the newer modal', async () => {
  const {desk, ids, rootId} = fixture();
  desk.drafts.post = 'Posted while a reading save waits';
  desk.drafts.replies[rootId] = 'An unrelated private reply';
  const h = harness(core.validateDesk(desk));
  const blocker = h.api.commit((current) => ({...current, preferences: {...current.preferences, theme: 'night'}}), {render: false});
  await h.store.waitForWrite();
  const earlierReading = h.api.navigateReader({anchorId: ids[12], reason: 'next'});
  h.api.compose();
  const form = h.document.getElementById('modal-body').querySelector('form');
  assert.ok(form, 'The actual composer must produce the submitted form');
  const posting = form.dispatch('submit');
  h.api.closeModal();
  const laterReading = h.api.navigateReader({anchorId: ids[24], reason: 'next'});
  const newerControl = h.document.createElement('input');
  h.api.openModal('Another task', newerControl); newerControl.focus();
  const closeCount = h.document.getElementById('modal').closeCount;
  h.store.resume(); await Promise.all([blocker, earlierReading, laterReading, posting]);
  const saved = h.store.saved(), posted = saved.messages.find((message) => message.body === desk.drafts.post);
  assert.ok(posted, 'The authorized post must still complete');
  assert.equal(saved.preferences.theme, 'night');
  assert.deepEqual(new Set(saved.local.readMessageIds), new Set([...ids.slice(12), posted.id]));
  assert.deepEqual(saved.local.readingPositions, [posted.id, ids[24]]);
  assert.equal(saved.drafts.post, '');
  assert.equal(saved.drafts.replies[rootId], 'An unrelated private reply');
  assert.equal(h.api.state().readerAnchor, ids[24], 'Late posting must not redirect a newer reading context');
  assert.equal(h.document.getElementById('modal').open, true);
  assert.equal(h.document.getElementById('modal').closeCount, closeCount);
  assert.equal(h.document.getElementById('modal-body').contains(newerControl), true);
  assert.equal(h.document.activeElement, newerControl);
});

check('logical focus resolves replacement postcard controls and carry choices by identity', () => {
  const {desk, ids, rootId} = fixture(), h = harness(desk);
  h.api.renderedThread(rootId);
  const region = h.document.getElementById('reader'), board = h.document.getElementById('board');
  function card(messageId) {
    const article = h.document.createElement('article');
    article.setAttribute('class', 'postcard'); article.setAttribute('data-message-id', messageId);
    const flip = h.document.createElement('button'); flip.setAttribute('data-flip', 'true'); article.append(flip);
    return {article, flip};
  }
  const original = card(ids[15]); region.append(original.article);
  const restoreFlip = h.api.captureDeskFocus(original.flip), restoreCard = h.api.captureDeskFocus(original.article);
  const replacement = card(ids[15]); region.replaceChildren(card(ids[14]).article, replacement.article);
  assert.equal(restoreFlip(), replacement.flip, 'A neighboring card must not receive the saved control focus');
  assert.equal(restoreCard(), replacement.article);
  assert.equal(replacement.article.getAttribute('tabindex'), '-1');
  replacement.flip.disabled = true;
  assert.equal(restoreFlip(), h.document.getElementById('view-filter'), 'Unavailable controls need a usable fallback');
  h.api.renderedThread('another-thread');
  assert.equal(restoreCard(), h.document.getElementById('view-filter'), 'A replacement conversation must not reuse the old focus target');

  function row(threadId) {
    const article = h.document.createElement('article'); article.setAttribute('data-thread-id', threadId);
    const check = h.document.createElement('input'); check.setAttribute('type', 'checkbox'); article.append(check);
    return {article, check};
  }
  const oldRow = row(rootId); board.append(oldRow.article);
  const restoreCarry = h.api.captureDeskFocus(oldRow.check), newRow = row(rootId);
  board.replaceChildren(row('another-thread').article, newRow.article);
  assert.equal(restoreCarry(), newRow.check);
  assert.equal(h.api.captureDeskFocus(h.document.getElementById('search')), null, 'External focus is outside the desk repaint resolver');
});

check('a failed reading save leaves the requested section usable and the committed desk unchanged', async () => {
  const {desk, ids} = fixture(), h = harness(desk);
  const reading = h.api.navigateReader({anchorId: ids[12], reason: 'next'});
  await h.store.waitForWrite();
  h.store.resume(new Error('Simulated storage capacity failure'));
  assert.equal(await reading, true, 'A failed read-state save must not block reading');
  assert.equal(h.api.state().readerAnchor, ids[12]);
  assert.deepEqual(h.store.saved(), desk);
  assert.deepEqual(h.api.state().desk, desk);
  assert.ok(h.notices.some(({message}) => /not saved|could not be saved/.test(message)));
  assert.equal(await h.api.navigateReader({anchorId: ids[24], reason: 'next'}), true);
  assert.deepEqual(h.store.saved().local.readMessageIds, ids.slice(24));
  assert.deepEqual(h.store.saved().local.readingPositions, [ids[24]]);
});

check('an asynchronous transform completes before later queued reading changes', async () => {
  const {desk, ids, rootId} = fixture(), h = harness(desk);
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const transformed = h.api.commit(async (current) => { await waiting; return core.setThreadFlag(current, rootId, 'bookmarked', true); }, {render: false});
  const reading = h.api.navigateReader({anchorId: ids[12], reason: 'next'});
  release(); h.store.resume();
  assert.equal(await transformed, true);
  assert.equal(await reading, true);
  assert.deepEqual(h.store.saved().local.bookmarkedThreadIds, [rootId]);
  assert.deepEqual(h.store.saved().local.readingPositions, [ids[12]]);
});
