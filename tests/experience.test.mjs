// Simulated DOM construction and interaction contracts only.
// This adapter is not a browser: these checks do not establish layout, focus,
// native dialog/printing, offline launch, or normal file-control acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesk, createMessage, prepareMailbag, serializeMailbag, acceptMailbag, groupThreads,
} from '../src/core.js';
import {
  showMailCall, showArrivalHistory, showPostmarkAlbum, showPrintKeepsake,
} from '../src/experience.js';

class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.value = attrs.value || '';
    const classes = new Set((attrs.class || '').split(' ').filter(Boolean));
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.append(...children.flat(Infinity));
  }
  append(...children) {
    for (const child of children) {
      if (child == null) continue;
      this.children.push(child);
      if (child instanceof Element) child.parent = this;
    }
  }
  replaceChildren(...children) { this.children = []; this.append(...children.flat(Infinity)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() { this.focusRequested = true; }
  get textContent() { return this.children.map((child) => child instanceof Element ? child.textContent : String(child)).join(' '); }
  set textContent(value) { this.children = [value]; }
}
const walk = (node) => node instanceof Element ? [node, ...node.children.flatMap(walk)] : [];
const hasClass = (node, name) => (node.attrs.class || '').split(' ').includes(name);
const settle = () => new Promise((resolve) => setImmediate(resolve));

function adapter({ readResult = true } = {}) {
  const state = { title: '', children: [], reads: [], cards: [], openedThreads: [], closed: false };
  const api = {
    el: (tag, attrs, ...children) => new Element(tag, attrs, children),
    button: (label, action, kind = 'secondary', attrs = {}) => new Element('button', { class: `button ${kind}`, onclick: action, ...attrs }, [label]),
    hint: (text) => new Element('p', { class: 'hint' }, [text]),
    badge: (text) => new Element('span', { class: 'badge' }, [text]),
    openModal: (title, children) => { state.title = title; state.children = children; },
    closeModal: () => { state.closed = true; },
    renderPostcard: (message, desk, options) => {
      state.cards.push({ message, options });
      return new Element('article', { 'data-message-id': message.id }, [message.body]);
    },
    markRead: async (ids) => { state.reads.push(...ids); return readResult; },
    openThread: (messageId) => { state.openedThreads.push(messageId); },
  };
  const nodes = () => state.children.flatMap(walk);
  const byId = (id) => nodes().find((node) => node.attrs.id === id);
  const byClass = (name) => nodes().filter((node) => hasClass(node, name));
  const click = (id) => {
    const node = byId(id);
    assert.ok(node, `Expected control ${id}`);
    assert.ok(!node.attrs.disabled, `Control ${id} is disabled`);
    return node.attrs.onclick();
  };
  return { state, api, nodes, byId, byClass, click };
}

function station(handle, postmark) {
  const desk = newDesk();
  desk.station.handle = handle;
  desk.station.postmark = postmark;
  return desk;
}

async function exchangeFixture() {
  let a = station('Maker A', 'Cumberland Maker Meetup');
  let b = station('Maker B', 'DEF CON');
  let created = createMessage(a, { body: 'Who has a spare rotary encoder?' });
  a = created.desk;
  const original = created.message;
  let packed = prepareMailbag(a, [original.id]);
  a = packed.desk;
  const outwardBag = JSON.parse(serializeMailbag(packed.bag));
  b = (await acceptMailbag(b, outwardBag)).desk;
  created = createMessage(b, { body: 'I have two. I can send one with the next maker.', parentId: original.id });
  b = created.desk;
  const reply = created.message;
  packed = prepareMailbag(b, [original.id]);
  b = packed.desk;
  const returnBag = JSON.parse(serializeMailbag(packed.bag));
  a = (await acceptMailbag(a, returnBag)).desk;
  return { a, b, original, reply, outwardBag, returnBag };
}

test('simulated Mail Call summary and local arrival history leave unread mail unread', async () => {
  const { a, returnBag } = await exchangeFixture();
  const ui = adapter();
  showMailCall(a, returnBag.id, ui.api);
  assert.equal(ui.state.title, 'Mail call');
  assert.equal(ui.byClass('mail-call-summary').length, 1);
  assert.deepEqual(ui.state.reads, []);
  assert.equal(ui.state.cards.length, 0, 'Summary must not open a message card');
  showArrivalHistory(a, ui.api);
  assert.equal(ui.byClass('arrival-entry').length, 1);
  assert.deepEqual(ui.state.reads, []);
  const replayed = (await acceptMailbag(a, returnBag)).desk;
  showArrivalHistory(replayed, ui.api);
  assert.equal(ui.byClass('arrival-entry').length, 1, 'Repeated bag must not add a history entry');
});

test('simulated Mail Call opens new reply first, preserves receipt markers, and marks only explicitly opened mail', async () => {
  const { a, original, reply, returnBag } = await exchangeFixture();
  const ui = adapter();
  showMailCall(a, returnBag.id, ui.api);
  ui.click('mail-call-start');
  await settle();
  assert.equal(ui.state.cards.at(-1).message.id, reply.id);
  assert.deepEqual(ui.state.reads, [reply.id]);
  const receipt = a.local.arrivals.at(-1).pathReceipts.find((record) => record.messageId === reply.id);
  assert.ok(ui.state.cards.at(-1).options.highlightMarks.has(receipt.markId));
  assert.equal(ui.byId('mail-call-prev').attrs.disabled, true);
  ui.click('mail-call-next');
  await settle();
  assert.equal(ui.state.cards.at(-1).message.id, original.id);
  assert.deepEqual(ui.state.reads, [reply.id], 'Already-read original needs no read-state save');
  ui.click('mail-call-prev');
  await settle();
  assert.deepEqual(ui.state.reads, [reply.id], 'Previous/next navigation must not repeat a completed read save');
  ui.click('mail-call-summary');
  assert.equal(ui.byClass('mail-call-summary').length, 1);
  assert.deepEqual(ui.state.reads, [reply.id]);
});

test('simulated Mail Call gives useful feedback when a read marker cannot be saved', async () => {
  const { a, returnBag } = await exchangeFixture();
  const ui = adapter({ readResult: false });
  showMailCall(a, returnBag.id, ui.api);
  ui.click('mail-call-start');
  await settle();
  assert.match(ui.byClass('mail-call-read-status')[0].textContent, /read marker could not be saved/);
  assert.equal(ui.byClass('mail-call-reader').length, 1, 'The open postcard must remain usable');
});

test('simulated album groups repeated marks by actual station, handle, and label and links associated postcards', async () => {
  const { a, original, reply } = await exchangeFixture();
  const ui = adapter();
  showPostmarkAlbum(a, ui.api);
  assert.equal(ui.byClass('album-entry').length, 2, 'Writing, packing and receipt stamps from one station share an album entry');
  ui.byId('album-search').value = 'def con';
  ui.byId('album-search').attrs.oninput();
  assert.equal(ui.byClass('album-entry').length, 1);
  assert.match(ui.byClass('album-count')[0].textContent, /2 postcards/);
  const postcardButtons = ui.nodes().filter((node) => node.tag === 'button' && node.attrs['data-message-id']);
  assert.deepEqual(new Set(postcardButtons.map((node) => node.attrs['data-message-id'])), new Set([original.id, reply.id]));
  postcardButtons[0].attrs.onclick();
  assert.deepEqual(ui.state.openedThreads, [postcardButtons[0].attrs['data-message-id']]);
  ui.byId('album-search').value = 'unrecorded label';
  ui.byId('album-search').attrs.oninput();
  assert.equal(ui.byClass('album-entry').length, 0);
  assert.match(ui.byId('album-results').textContent, /No postmarks or handles match/);
});

async function printEnvironment(run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const body = new Element('body');
  const events = new Map();
  const environment = { body, events, onPrint: () => {} };
  globalThis.document = { body, getElementById: (id) => walk(body).find((node) => node.attrs.id === id) };
  globalThis.window = {
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
    print: () => environment.onPrint(),
  };
  try { await run(environment); }
  finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

test('simulated keepsake prints both sides of every public postcard, retains distinct branches, and excludes private desk data', async () => {
  let { a, original, reply, outwardBag } = await exchangeFixture();
  let c = station('Maker C', 'Hamfest swap table');
  c = (await acceptMailbag(c, outwardBag)).desk;
  const packed = prepareMailbag(c, [original.id]);
  a = (await acceptMailbag(a, JSON.parse(serializeMailbag(packed.bag)))).desk;
  assert.equal(a.routes.filter((route) => route.messageId === original.id).length, 2);
  a.drafts.post = 'PRIVATE DRAFT MUST NEVER PRINT';
  a.drafts.replies[original.id] = 'PRIVATE REPLY MUST NEVER PRINT';
  const before = JSON.stringify(a);
  const ui = adapter();
  await printEnvironment(async ({ body, events }) => {
    // Set the print callback after the environment exists, as a browser test
    // could inspect the print tree during its intercepted print call.
    window.print = () => {
      const sheet = document.getElementById('print-sheet');
      assert.ok(sheet);
      assert.ok(body.classList.contains('printing-keep'));
      assert.ok(sheet.textContent.includes(original.body));
      assert.ok(sheet.textContent.includes(reply.body));
      assert.ok(!sheet.textContent.includes(a.drafts.post));
      assert.ok(!sheet.textContent.includes(a.drafts.replies[original.id]));
      const pages = walk(sheet);
      assert.equal(pages.filter((node) => hasClass(node, 'keepsake-front')).length, 2);
      assert.equal(pages.filter((node) => hasClass(node, 'keepsake-back')).length, 2);
      assert.equal(pages.filter((node) => hasClass(node, 'keepsake-path')).length, a.routes.length);
      const back = pages.find((node) => hasClass(node, 'keepsake-back') && node.attrs['data-message-id'] === original.id);
      assert.equal(walk(back).filter((node) => hasClass(node, 'keepsake-path')).length, 2, 'Two known copy paths stay separate');
    };
    showPrintKeepsake(a, groupThreads(a)[0], ui.api);
    assert.equal(document.getElementById('print-sheet'), undefined);
    assert.equal(ui.byClass('keepsake-preview').length, 1);
    ui.click('keepsake-print');
    assert.ok(events.has('afterprint'));
    events.get('afterprint')();
    assert.equal(document.getElementById('print-sheet'), undefined);
    assert.equal(body.classList.contains('printing-keep'), false);
    assert.equal(events.has('afterprint'), false);
  });
  assert.equal(JSON.stringify(a), before, 'Printing must not mutate the desk');
});

test('simulated print failure removes the temporary print tree and preserves the preview', async () => {
  const { a } = await exchangeFixture();
  const ui = adapter();
  await printEnvironment(async ({ body, events }) => {
    window.print = () => { throw new Error('Print unavailable'); };
    showPrintKeepsake(a, groupThreads(a)[0], ui.api);
    ui.click('keepsake-print');
    assert.equal(document.getElementById('print-sheet'), undefined);
    assert.equal(body.classList.contains('printing-keep'), false);
    assert.equal(events.has('afterprint'), false);
    assert.equal(ui.byClass('keepsake-preview').length, 1);
    assert.match(ui.byClass('keepsake-feedback')[0].textContent, /could not open printing/);
  });
});

test('simulated experience empty states contain no sample postcards or read actions', () => {
  const desk = newDesk();
  const ui = adapter();
  for (const open of [
    () => showMailCall(desk, 'no-such-arrival', ui.api),
    () => showArrivalHistory(desk, ui.api),
    () => showPostmarkAlbum(desk, ui.api),
    () => showPrintKeepsake(desk, null, ui.api),
  ]) {
    open();
    assert.equal(ui.byClass('experience-empty').length, 1);
    assert.equal(ui.state.cards.length, 0);
    assert.deepEqual(ui.state.reads, []);
  }
});
