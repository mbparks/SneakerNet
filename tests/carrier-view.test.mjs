// Simulated DOM construction and interaction contracts, using actual public
// mailbag fixtures. Not browser layout, native file download, or offline proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDesk, createMessage, prepareMailbag, serializeMailbag, rebuildMailbag, acceptMailbag,
} from '../src/core.js';
import { showOutbox, showPackingReceipt } from '../src/carrier.js';

class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.value = attrs.value || '';
    this.disabled = Boolean(attrs.disabled);
    this.append(...children.flat(Infinity));
  }
  append(...children) { this.children.push(...children.filter((child) => child != null)); }
  replaceChildren(...children) { this.children = []; this.append(...children.flat(Infinity)); }
  focus() { this.focusRequested = true; }
  get textContent() { return this.children.map((child) => child instanceof Element ? child.textContent : String(child)).join(' '); }
  set textContent(value) { this.children = [value]; }
}
const walk = (node) => node instanceof Element ? [node, ...node.children.flatMap(walk)] : [];
const hasClass = (node, name) => (node.attrs.class || '').split(' ').includes(name);

function adapter({ download = async () => true } = {}) {
  const state = { title: '', children: [], manifests: [], raw: [], downloads: [], packRequests: [], closed: false };
  const api = {
    el: (tag, attrs, ...children) => new Element(tag, attrs, children),
    button: (label, action, kind = 'secondary', attrs = {}) => new Element('button', { class: `button ${kind}`, onclick: action, ...attrs }, [label]),
    hint: (text) => new Element('p', { class: 'hint' }, [text]),
    badge: (text) => new Element('span', { class: 'badge' }, [text]),
    openModal: (title, children) => { state.title = title; state.children = children; },
    closeModal: () => { state.closed = true; },
    manifest: (bag) => {
      state.manifests.push(structuredClone(bag));
      return new Element('section', { class: 'manifest-list' }, [
        ...bag.messages.map((message) => new Element('article', { 'data-message-id': message.id }, [message.handle, message.body])),
        ...bag.routes.map((route) => new Element('section', { class: 'route' }, route.path.map((mark) => `${mark.handle} ${mark.postmark} ${mark.kind}`))),
      ]);
    },
    rawManifest: (bag, serialized) => {
      state.raw.push({ bag: structuredClone(bag), serialized });
      return new Element('pre', { class: 'json-preview' }, [serialized]);
    },
    downloadBag: async (bagId) => { state.downloads.push(bagId); return download(bagId); },
    packThreads: (messageIds) => { state.packRequests.push([...messageIds]); },
  };
  const nodes = () => state.children.flatMap(walk);
  const byId = (id) => nodes().find((node) => node.attrs.id === id);
  const byClass = (name) => nodes().filter((node) => hasClass(node, name));
  const click = (id) => {
    const node = byId(id);
    assert.ok(node, `Expected control ${id}`);
    assert.ok(!node.disabled, `Control ${id} is disabled`);
    return node.attrs.onclick();
  };
  return { state, api, nodes, byId, byClass, click, text: () => state.children.map((node) => node.textContent).join('\n') };
}

function station(handle, postmark) {
  const desk = newDesk();
  desk.station.handle = handle;
  desk.station.postmark = postmark;
  return desk;
}

function baseFixture() {
  const created = createMessage(station('Maker A', 'Cumberland Maker Meetup'), { body: 'Who has a spare rotary encoder?' });
  const prepared = prepareMailbag(created.desk, [created.message.id]);
  return { a: prepared.desk, original: created.message, originalBag: prepared.bag, originalText: serializeMailbag(prepared.bag) };
}

async function returnFixture() {
  let { a, original, originalBag, originalText } = baseFixture();
  let b = station('Maker B', 'DEF CON');
  b = (await acceptMailbag(b, JSON.parse(originalText))).desk;
  const reply = createMessage(b, { body: 'Two spare encoders here. I will bring one back.', parentId: original.id });
  b = reply.desk;
  const packed = prepareMailbag(b, [original.id]);
  a = (await acceptMailbag(a, JSON.parse(serializeMailbag(packed.bag)))).desk;
  return { a, original, originalBag, originalText, reply: reply.message };
}

function atClock(iso, operation) {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [iso])); }
    static now() { return RealDate.parse(iso); }
  };
  try { return operation(); }
  finally { globalThis.Date = RealDate; }
}

test('simulated empty outbox invents no packing history and offers a usable return', () => {
  const desk = createMessage(station('Maker A', 'Cumberland'), { body: 'An unpacked postcard.' }).desk;
  const before = JSON.stringify(desk);
  const ui = adapter();
  showOutbox(desk, ui.api);
  assert.equal(ui.state.title, 'Outbox');
  assert.equal(ui.byClass('outbox-entry').length, 0);
  assert.match(ui.text(), /No packing receipts yet/);
  assert.match(ui.text(), /old bag records are not invented/);
  assert.deepEqual(ui.state.downloads, []);
  const back = ui.nodes().find((node) => node.tag === 'button' && node.textContent === 'Back to the desk');
  assert.ok(back);
  back.attrs.onclick();
  assert.equal(ui.state.closed, true);
  assert.equal(JSON.stringify(desk), before);
});

test('simulated outbox follows packing order when station clocks move backwards', () => {
  const created = createMessage(station('Maker A', 'Cumberland'), { body: 'An encoder for a project.' });
  const first = atClock('2030-05-01T10:00:00.000Z', () => prepareMailbag(created.desk, [created.message.id]));
  const second = atClock('2020-05-01T10:00:00.000Z', () => prepareMailbag(first.desk, [created.message.id]));
  const ui = adapter();
  showOutbox(second.desk, ui.api);
  assert.deepEqual(ui.byClass('outbox-entry').map((node) => node.attrs['data-bag-id']), [second.bag.id, first.bag.id]);
  assert.equal(ui.state.manifests.length, 0, 'Listing receipts must not rebuild and render every complete public bag');
  assert.match(ui.byClass('outbox-counts')[0].textContent, /1 thread · 1 postcard · 1 known path/);
  assert.match(ui.text(), /do not confirm saving, transfer, or delivery/);
});

test('simulated receipt preserves original public contents after later replies, paths, and station changes', async () => {
  const { a, original, originalBag, originalText, reply } = await returnFixture();
  a.station.handle = 'Changed station handle';
  a.station.postmark = 'PRIVATE CURRENT STATION';
  a.drafts.post = 'PRIVATE DRAFT DO NOT EXPORT';
  a.drafts.replies[original.id] = 'PRIVATE REPLY DO NOT EXPORT';
  a.local.bookmarkedThreadIds = [original.id];
  const before = JSON.stringify(a);
  const ui = adapter();
  showPackingReceipt(a, originalBag.id, ui.api);
  assert.equal(ui.state.title, 'Packing receipt');
  assert.equal(ui.byClass('packing-receipt')[0].attrs['data-bag-id'], originalBag.id);
  assert.equal(ui.state.raw[0].serialized, originalText);
  assert.deepEqual(ui.state.manifests[0], JSON.parse(originalText));
  assert.ok(ui.text().includes(original.body));
  assert.ok(!ui.text().includes(reply.body), 'A later reply must not appear in an older receipt');
  assert.ok(!ui.text().includes(a.station.postmark));
  assert.ok(!ui.text().includes(a.drafts.post));
  assert.ok(!ui.text().includes(a.drafts.replies[original.id]));
  assert.equal(ui.state.manifests[0].routes[0].path.length, 2, 'Original packing path ends at its original packed mark');
  assert.ok(a.routes.find((route) => route.messageId === original.id).path.length > 2);
  assert.equal(JSON.stringify(a), before);
});

test('simulated same-bag download uses the original identity once while pending and changes no saved state', async () => {
  const { a, originalBag, originalText } = await returnFixture();
  const before = JSON.stringify(a);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let downloadedText;
  const ui = adapter({ download: async (bagId) => {
    downloadedText = serializeMailbag(rebuildMailbag(a, bagId));
    await pending;
    return true;
  } });
  showPackingReceipt(a, originalBag.id, ui.api);
  const button = ui.byId('outbox-download');
  const first = ui.click('outbox-download');
  assert.equal(button.disabled, true);
  await button.attrs.onclick();
  assert.deepEqual(ui.state.downloads, [originalBag.id]);
  release();
  await first;
  assert.equal(downloadedText, originalText);
  assert.equal(button.disabled, false);
  assert.match(ui.byClass('outbox-download-status')[0].textContent, /Download started with the original bag ID/);
  assert.equal(JSON.stringify(a), before);
});

test('simulated repeat-carry action opens a new review using original thread message identities', async () => {
  const { a, original, originalBag } = await returnFixture();
  const before = JSON.stringify(a);
  const ui = adapter();
  showPackingReceipt(a, originalBag.id, ui.api);
  ui.click('outbox-pack-current');
  assert.deepEqual(ui.state.packRequests, [[original.id]], 'The root maps these immutable IDs to their complete current thread');
  assert.deepEqual(ui.state.downloads, []);
  assert.equal(JSON.stringify(a), before, 'Choosing current threads does not pack without review');
  ui.click('outbox-back');
  assert.equal(ui.state.title, 'Outbox');
});

test('simulated outbox pages recent receipts and searches original postcard text, handles, and bag IDs', () => {
  let { a, original } = baseFixture();
  for (let i = 0; i < 13; i++) a = prepareMailbag(a, [original.id]).desk;
  const ordered = [...a.local.outbox].reverse().map((receipt) => receipt.bagId);
  const ui = adapter();
  showOutbox(a, ui.api);
  assert.deepEqual(ui.byClass('outbox-entry').map((node) => node.attrs['data-bag-id']), ordered.slice(0, 12));
  assert.equal(ui.byId('outbox-newer').disabled, true);
  ui.click('outbox-older');
  assert.deepEqual(ui.byClass('outbox-entry').map((node) => node.attrs['data-bag-id']), ordered.slice(12));
  assert.equal(ui.byId('outbox-results').focusRequested, true);
  ui.byId('outbox-search').value = ordered.at(-1);
  ui.byId('outbox-search').attrs.oninput();
  assert.deepEqual(ui.byClass('outbox-entry').map((node) => node.attrs['data-bag-id']), [ordered.at(-1)]);
  assert.match(ui.byId('outbox-results').textContent, /^1 packed bag/);
  ui.byId('outbox-search').value = 'MAKER A';
  ui.byId('outbox-search').attrs.oninput();
  assert.equal(ui.byClass('outbox-entry').length, 12, 'Search resets to the first page');
  ui.byId('outbox-search').value = 'spare rotary';
  ui.byId('outbox-search').attrs.oninput();
  assert.match(ui.byId('outbox-results').textContent, /^14 packed bags/);
  ui.byId('outbox-search').value = 'not in any packed postcard';
  ui.byId('outbox-search').attrs.oninput();
  assert.equal(ui.byClass('outbox-entry').length, 0);
  assert.match(ui.byId('outbox-results').textContent, /No packed bags match/);
});

test('simulated unavailable receipt fails visibly without inventing a replacement bag', () => {
  const { a } = baseFixture();
  const before = JSON.stringify(a);
  const ui = adapter();
  showPackingReceipt(a, `bag_${crypto.randomUUID()}`, ui.api);
  assert.equal(ui.state.title, 'Packing receipt unavailable');
  assert.ok(ui.nodes().some((node) => node.attrs.role === 'alert'));
  assert.equal(ui.state.manifests.length, 0);
  assert.equal(ui.state.raw.length, 0);
  assert.deepEqual(ui.state.downloads, []);
  ui.click('outbox-back');
  assert.equal(ui.state.title, 'Outbox');
  assert.equal(JSON.stringify(a), before);
});

test('simulated download failure preserves the receipt and re-enables retry', async () => {
  const { a, originalBag } = baseFixture();
  const before = JSON.stringify(a);
  for (const download of [async () => false, async () => { throw new Error('Download unavailable'); }]) {
    const ui = adapter({ download });
    showPackingReceipt(a, originalBag.id, ui.api);
    await ui.click('outbox-download');
    assert.equal(ui.byId('outbox-download').disabled, false);
    assert.match(ui.byClass('outbox-download-status')[0].textContent, /saved packing receipt is unchanged/);
    assert.equal(ui.byClass('packing-receipt').length, 1);
  }
  assert.equal(JSON.stringify(a), before);
});
