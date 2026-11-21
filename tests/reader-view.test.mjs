// Simulated reader construction/navigation. These checks do not establish
// browser layout, real focus, storage commits, scrolling, or touch behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadReader, readingWindow } from '../src/reader.js';

class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.disabled = Boolean(attrs.disabled);
    this.hidden = Boolean(attrs.hidden);
    this.focusCount = 0;
    this.append(...children.flat(Infinity));
  }
  append(...children) {
    for (const child of children.filter((value) => value != null)) {
      this.children.push(child);
      if (child instanceof Element) child.parent = this;
    }
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  focus() { this.focusCount++; }
  replaceWith(next) {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (index !== -1) { this.parent.children[index] = next; next.parent = this.parent; this.parent = null; }
  }
  querySelector(selector) {
    const match = /^\[data-message-id="([^"]+)"\]$/.exec(selector);
    if (!match) throw new Error(`The test adapter does not model ${selector}`);
    return walk(this).find((node) => node.attrs['data-message-id'] === match[1]) || null;
  }
  get textContent() { return this.children.map((child) => child instanceof Element ? child.textContent : String(child)).join(' '); }
  set textContent(value) { this.children = [value]; }
}
const walk = (node) => node instanceof Element ? [node, ...node.children.flatMap(walk)] : [];
const byId = (reader, id) => walk(reader.node).find((node) => node.attrs.id === id);
const cards = (reader) => walk(reader.node).filter((node) => node.attrs['data-message-id']);
const ids = (reader) => cards(reader).map((node) => node.attrs['data-message-id']);
const click = async (reader, id) => {
  const control = byId(reader, id);
  assert.ok(control, `Missing control ${id}`);
  assert.equal(control.disabled, false, `${id} must be enabled`);
  return control.attrs.onclick();
};
const fixture = (count = 27) => {
  const messages = Array.from({ length: count }, (_, i) => ({
    id: `message-${i + 1}`, parentId: i ? 'message-1' : null,
    handle: `maker-${i + 1}`, body: `Postcard ${i + 1}`,
    // Reported clocks run backwards; the supplied causal order must stay put.
    createdAt: new Date(Date.UTC(2030 - i, 0, 1)).toISOString(),
  }));
  const thread = { id: 'message-1', root: messages[0] || null, messages, missingParentId: null };
  const desk = { messages, drafts: { post: 'Private draft' }, local: { readMessageIds: [] } };
  return { desk, thread };
};
function adapter({ result = true, navigate = null } = {}) {
  const state = { renders: [], requests: [] };
  const api = {
    el: (tag, attrs, ...children) => new Element(tag, attrs, children),
    button: (label, action, kind = 'secondary', attrs = {}) => new Element('button', { class: kind, onclick: action, ...attrs }, [label]),
    hint: (text) => new Element('p', { class: 'hint' }, [text]),
    renderPostcard: (message, desk, options) => {
      state.renders.push({ message, desk, options });
      return new Element('article', { class: 'postcard', 'data-message-id': message.id }, [
        message.body,
        options.onParent ? new Element('button', { 'data-parent-id': message.parentId, onclick: options.onParent }, ['Read parent postcard']) : null,
      ]);
    },
    onNavigate: async (request) => {
      state.requests.push(structuredClone(request));
      return navigate ? navigate(request) : result;
    },
  };
  return { api, state };
}

test('simulated long reader renders one causal section without marking mail or moving focus', () => {
  const data = fixture(2000), before = JSON.stringify(data), ui = adapter();
  const reader = createThreadReader({ ...data, anchorId: 'message-1201', firstUnreadId: 'message-1204' }, ui.api);
  assert.equal(ui.state.renders.length, 12, 'Hidden cards must not be constructed');
  assert.deepEqual(ids(reader), data.thread.messages.slice(1200, 1212).map((message) => message.id));
  assert.equal(reader.anchorId, 'message-1201');
  assert.equal(reader.page, 100);
  assert.equal(reader.node.attrs['data-anchor-id'], 'message-1201');
  assert.equal(byId(reader, 'reader-page-status').textContent, 'Postcards 1201–1212 of 2000');
  assert.deepEqual(ui.state.requests, [], 'Construction and automatic preview must remain read-only');
  assert.equal(walk(reader.node).reduce((n, node) => n + node.focusCount, 0), 0);
  assert.equal(JSON.stringify(data), before, 'View construction cannot save reading state or alter mail');
});

test('simulated section controls delegate only exposed IDs and preserve or reset return context deliberately', async () => {
  const data = fixture(), ui = adapter();
  const reader = createThreadReader({ ...data, anchorId: 'message-15', firstUnreadId: 'message-15', resumeId: 'message-2', returnToId: 'message-27' }, ui.api);
  assert.equal(byId(reader, 'reader-first-unread').disabled, false, 'Unread at the automatic preview anchor still needs an explicit reading action');
  assert.equal(byId(reader, 'reader-resume'), undefined, 'Automatic resume needs no permanently disabled duplicate control');
  await click(reader, 'reader-first-unread');
  assert.deepEqual(ui.state.requests.at(-1), { threadId: data.thread.id, anchorId: 'message-15',
    messageIds: data.thread.messages.slice(12, 24).map((message) => message.id), returnToId: null, reason: 'first-unread' });
  await click(reader, 'reader-previous');
  assert.deepEqual(ui.state.requests.at(-1), { threadId: data.thread.id, anchorId: 'message-1',
    messageIds: data.thread.messages.slice(0, 12).map((message) => message.id), returnToId: 'message-27', reason: 'previous' });
  await click(reader, 'reader-next');
  assert.deepEqual(ui.state.requests.at(-1), { threadId: data.thread.id, anchorId: 'message-25',
    messageIds: data.thread.messages.slice(24).map((message) => message.id), returnToId: 'message-27', reason: 'next' });
  assert.equal(ui.state.requests.every((request) => request.messageIds.length <= 12), true);
});

test('simulated parent navigation targets the exact parent and offers a return to the originating reply', async () => {
  const data = fixture();
  data.thread.messages[26].parentId = 'message-14';
  const ui = adapter();
  const replyReader = createThreadReader({ ...data, anchorId: 'message-27' }, ui.api);
  const reply = cards(replyReader).find((card) => card.attrs['data-message-id'] === 'message-27');
  await reply.children.find((node) => node instanceof Element && node.attrs['data-parent-id']).attrs.onclick();
  const request = ui.state.requests.at(-1);
  assert.deepEqual(request, { threadId: data.thread.id, anchorId: 'message-14',
    messageIds: data.thread.messages.slice(12, 24).map((message) => message.id), returnToId: 'message-27', reason: 'parent' });
  const parentReader = createThreadReader({ ...data, anchorId: request.anchorId, returnToId: request.returnToId }, ui.api);
  parentReader.focusAnchor();
  assert.equal(cards(parentReader).find((card) => card.attrs['data-message-id'] === 'message-14').focusCount, 1);
  assert.equal(byId(parentReader, 'reader-return').hidden, false);
  await click(parentReader, 'reader-return');
  assert.deepEqual(ui.state.requests.at(-1), { threadId: data.thread.id, anchorId: 'message-27',
    messageIds: data.thread.messages.slice(24).map((message) => message.id), returnToId: null, reason: 'return' });
});

test('simulated missing parents stay unresolved and unavailable jumps cannot fabricate a target', () => {
  const data = fixture(1), ui = adapter();
  data.thread.messages[0].parentId = 'parent-not-here';
  data.thread.root = null; data.thread.missingParentId = 'parent-not-here';
  const reader = createThreadReader({ ...data, firstUnreadId: 'unknown', returnToId: 'unknown' }, ui.api);
  assert.equal(ui.state.renders[0].options.onParent, null);
  assert.equal(byId(reader, 'reader-first-unread').disabled, true);
  assert.equal(byId(reader, 'reader-return').hidden, true);
  assert.equal(byId(reader, 'reader-previous').disabled, true);
  assert.equal(byId(reader, 'reader-next').disabled, true);
  assert.deepEqual(ui.state.requests, []);
});

test('simulated pending navigation blocks repeated page and parent requests then recovers from failure', async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const data = fixture(), ui = adapter({ navigate: () => waiting });
  const reader = createThreadReader({ ...data, firstUnreadId: 'message-1' }, ui.api);
  const first = click(reader, 'reader-next');
  assert.equal(byId(reader, 'reader-next').disabled, true);
  assert.equal(byId(reader, 'reader-first-unread').disabled, true);
  assert.equal(reader.node.attrs['aria-busy'], 'true');
  await byId(reader, 'reader-next').attrs.onclick();
  await ui.state.renders[1].options.onParent();
  assert.equal(ui.state.requests.length, 1, 'One pending request must not start a second navigation/save');
  release(false);
  assert.equal(await first, false);
  assert.equal(reader.node.attrs['aria-busy'], 'false');
  assert.equal(byId(reader, 'reader-next').disabled, false);
  assert.deepEqual(ids(reader), data.thread.messages.slice(0, 12).map((message) => message.id));
  const feedback = walk(reader.node).find((node) => node.attrs.class?.includes('reader-navigation-status'));
  assert.equal(feedback.attrs.role, 'alert');
  assert.match(feedback.textContent, /could not be opened/);
});

test('simulated thrown navigation failure preserves the section and allows retry without claiming a save', async () => {
  let attempts = 0;
  const data = fixture(), ui = adapter({ navigate: async () => { if (++attempts === 1) throw new Error('Storage is unavailable'); return true; } });
  const reader = createThreadReader(data, ui.api);
  const before = ids(reader);
  assert.equal(await click(reader, 'reader-next'), false);
  assert.match(reader.node.textContent, /Storage is unavailable/);
  assert.deepEqual(ids(reader), before);
  assert.equal(byId(reader, 'reader-next').disabled, false);
  assert.equal(await click(reader, 'reader-next'), true);
  assert.equal(ui.state.requests.length, 2);
  assert.doesNotMatch(reader.node.textContent, /Storage is unavailable|Saved on/);
});

test('simulated focus follows the live flipped postcard after element replacement', () => {
  const data = fixture(), ui = adapter();
  const reader = createThreadReader({ ...data, anchorId: 'message-16' }, ui.api);
  const original = cards(reader).find((card) => card.attrs['data-message-id'] === 'message-16');
  const replacement = new Element('article', { class: 'postcard is-back', 'data-message-id': 'message-16' }, ['The live postcard back']);
  original.replaceWith(replacement);
  reader.focusAnchor();
  assert.equal(original.focusCount, 0, 'Detached fronts must not receive the focus request');
  assert.equal(replacement.focusCount, 1);
  assert.equal(replacement.attrs.tabindex, '-1');
});

test('reading window resolves saved message anchors after thread growth and handles an absent anchor', () => {
  const data = fixture();
  const before = JSON.stringify(data.thread);
  assert.deepEqual(readingWindow(data.thread, 'message-27').messageIds, ['message-25', 'message-26', 'message-27']);
  assert.equal(readingWindow(data.thread, 'message-27').anchorId, 'message-27');
  assert.equal(readingWindow(data.thread, 'no-longer-present').anchorId, 'message-1');
  const prefix = { ...data.thread.messages[0], id: 'new-ancestor', parentId: null };
  const grown = { ...data.thread, messages: [prefix, ...data.thread.messages] };
  const anchored = readingWindow(grown, 'message-12');
  assert.equal(anchored.page, 1, 'The saved message, not a stale page number, determines the section after regrouping');
  assert.equal(anchored.anchorId, 'message-12');
  assert.equal(anchored.messageIds.includes('message-12'), true);
  assert.equal(JSON.stringify(data.thread), before);
  const empty = readingWindow({ messages: [] }, 'message-27');
  assert.equal(empty.anchorId, null);
  assert.deepEqual(empty.messageIds, []);
});
