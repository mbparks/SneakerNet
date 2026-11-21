// Simulated DOM behavior for paging. These checks exercise list/selection
// contracts; they do not establish layout, browser focus, or touch behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, createPagedList } from '../src/desk-view.js';

class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.disabled = Boolean(attrs.disabled);
    this.checked = Boolean(attrs.checked);
    this.hidden = Boolean(attrs.hidden);
    this.focusCount = 0;
    this.append(...children.flat(Infinity));
  }
  append(...children) { this.children.push(...children.filter(child => child != null)); }
  replaceChildren(...children) { this.children = []; this.append(...children.flat(Infinity)); }
  focus() { this.focusCount++; }
  get textContent() { return this.children.map(child => child instanceof Element ? child.textContent : String(child)).join(' '); }
  set textContent(value) { this.children = [value]; }
}

const walk = node => node instanceof Element ? [node, ...node.children.flatMap(walk)] : [];
const api = {
  el: (tag, attrs, ...children) => new Element(tag, attrs, children),
  button: (label, action, kind = 'secondary', attrs = {}) => new Element('button', { class: kind, onclick: action, ...attrs }, [label]),
  hint: text => new Element('p', { class: 'hint' }, [text]),
};
const items = count => Array.from({ length: count }, (_, i) => ({ id: `card-${i + 1}`, body: `Postcard ${i + 1}` }));
const byClass = (pager, name) => walk(pager.node).find(node => (node.attrs.class || '').split(' ').includes(name));
const rows = pager => byClass(pager, 'paged-items').children;
const ids = pager => rows(pager).map(row => row.attrs['data-id']);
const byId = (pager, id) => walk(pager.node).find(node => node.attrs.id === id);
const click = (pager, id) => {
  const button = byId(pager, id);
  assert.ok(button, `Missing ${id}`);
  assert.equal(button.disabled, false, `${id} must be enabled`);
  button.attrs.onclick();
};
const renderItem = item => api.el('article', { 'data-id': item.id }, item.body);

test('simulated paging renders at most twelve of a large list and reveals a requested item', () => {
  const source = items(2000), before = structuredClone(source);
  let rendered = 0;
  const pager = createPagedList({ id: 'board', label: 'Threads', items: source,
    renderItem: item => { rendered++; return renderItem(item); } }, api);
  assert.equal(PAGE_SIZE, 12);
  assert.equal(rendered, 12, 'Initial rendering must not build hidden rows');
  assert.deepEqual(ids(pager), source.slice(0, 12).map(item => item.id));
  assert.equal(byId(pager, 'board-page-status').textContent, 'Threads 1–12 of 2000');
  assert.equal(byId(pager, 'board-previous').disabled, true);
  assert.equal(byClass(pager, 'page-actions').hidden, false);
  click(pager, 'board-next');
  assert.deepEqual(ids(pager), source.slice(12, 24).map(item => item.id));
  assert.equal(byId(pager, 'board-page-status').focusCount, 1);
  pager.setItems(source, { revealKey: 'card-2000' });
  assert.deepEqual(ids(pager), source.slice(1992).map(item => item.id));
  assert.equal(byId(pager, 'board-next').disabled, true);
  assert.equal(byId(pager, 'board-page-status').textContent, 'Threads 1993–2000 of 2000');
  assert.equal(byId(pager, 'board-page-status').focusCount, 1, 'Programmatic updates must not steal focus');
  assert.deepEqual(source, before, 'Paging must not reorder or edit the source mail');
});

test('simulated carry choices remain in the caller across page changes, search, and refresh', () => {
  const source = items(27), selected = new Set();
  let pager;
  pager = createPagedList({ id: 'packing', label: 'Threads', items: source,
    renderItem: item => {
      const input = api.el('input', { type: 'checkbox', checked: selected.has(item.id) });
      input.attrs.onchange = () => { input.checked ? selected.add(item.id) : selected.delete(item.id); pager.refresh(); };
      return api.el('label', { 'data-id': item.id }, input, item.body);
    } }, api);
  const toggle = (id, checked) => {
    const row = rows(pager).find(row => row.attrs['data-id'] === id);
    assert.ok(row);
    row.children[0].checked = checked;
    row.children[0].attrs.onchange();
  };
  toggle('card-2', true);
  click(pager, 'packing-next');
  toggle('card-20', true);
  click(pager, 'packing-previous');
  assert.equal(rows(pager)[1].children[0].checked, true);
  pager.setItems(source.filter(item => item.id === 'card-20'), { reset: true });
  assert.equal(rows(pager)[0].children[0].checked, true);
  assert.deepEqual([...selected], ['card-2', 'card-20'], 'Hidden rows must retain their choice');
  toggle('card-20', false);
  pager.setItems(source, { reset: true });
  assert.equal(rows(pager)[1].children[0].checked, true);
  assert.deepEqual([...selected], ['card-2']);
});

test('simulated shrinking filters clamp the page and explicit reset returns to the first results', () => {
  const source = items(27);
  const pager = createPagedList({ id: 'board', label: 'Threads', items: source, renderItem }, api);
  click(pager, 'board-next'); click(pager, 'board-next');
  assert.equal(pager.page, 2);
  pager.setItems(source.slice(0, 14));
  assert.equal(pager.page, 1);
  assert.deepEqual(ids(pager), ['card-13', 'card-14']);
  pager.setItems(source.slice(4, 7));
  assert.equal(pager.page, 0);
  assert.deepEqual(ids(pager), ['card-5', 'card-6', 'card-7']);
  assert.equal(byClass(pager, 'page-actions').hidden, true);
  pager.setItems(source);
  click(pager, 'board-next');
  pager.setItems(source, { reset: true });
  assert.equal(pager.page, 0);
  assert.deepEqual(ids(pager), source.slice(0, 12).map(item => item.id));
});

test('simulated empty results stay usable and repopulate without an invalid page', () => {
  const pager = createPagedList({ id: 'manifest', label: 'Postcards', items: [], renderItem, emptyText: 'No postcards match.' }, api);
  assert.equal(byId(pager, 'manifest-page-status').textContent, '0 postcards');
  assert.equal(byClass(pager, 'page-actions').hidden, true);
  assert.equal(byId(pager, 'manifest-previous').disabled, true);
  assert.equal(byId(pager, 'manifest-next').disabled, true);
  assert.equal(rows(pager)[0].textContent, 'No postcards match.');
  pager.setItems(items(13), { revealKey: 'card-13' });
  assert.equal(pager.page, 1);
  assert.deepEqual(ids(pager), ['card-13']);
  pager.setItems([]);
  assert.equal(pager.page, 0);
  assert.equal(byId(pager, 'manifest-page-status').textContent, '0 postcards');
});

test('simulated custom keys and page sizes reveal the matching item without moving for a missing key', () => {
  const source = items(18).map(item => ({ ...item, receipt: `receipt-${item.id}` }));
  const pager = createPagedList({ id: 'receipts', label: 'Receipts', items: source, renderItem,
    key: item => item.receipt, pageSize: 5 }, api);
  pager.setItems(source, { revealKey: 'receipt-card-17' });
  assert.equal(pager.page, 3);
  assert.deepEqual(ids(pager), ['card-16', 'card-17', 'card-18']);
  pager.setItems(source, { revealKey: 'unknown-receipt' });
  assert.equal(pager.page, 3);
  pager.setItems(source, { reset: true, revealKey: 'receipt-card-12' });
  assert.equal(pager.page, 2);
  assert.deepEqual(ids(pager), ['card-11', 'card-12', 'card-13', 'card-14', 'card-15']);
});
