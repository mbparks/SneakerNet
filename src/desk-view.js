// Small, shared paging control for the board, packing choices, and manifests.
// It only holds a view of the supplied items; it never edits mail or selection.
export const PAGE_SIZE = 12;

export function pageWindow(items, requestedPage = 0, pageSize = PAGE_SIZE) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0));
  const start = page * size;
  return { page, pages, start, end: Math.min(start + size, items.length), items: items.slice(start, start + size) };
}

/** api supplies the same safe DOM constructors used throughout the app. */
export function createPagedList({ id, label, items = [], renderItem, key = (item) => item.id, pageSize = PAGE_SIZE, emptyText = 'No matching items.' }, api) {
  const { el, button, hint } = api;
  pageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
  let all = items;
  let page = 0;
  const status = el('p', { id: `${id}-page-status`, class: 'page-status', role: 'status', tabindex: '-1' });
  const list = el('div', { class: 'paged-items' });
  const move = (delta) => {
    page += delta;
    paint();
    status.focus();
  };
  const previous = button('Previous', () => move(-1), 'quiet', { id: `${id}-previous`, 'aria-label': `Previous page of ${label.toLocaleLowerCase()}` });
  const next = button('Next', () => move(1), 'quiet', { id: `${id}-next`, 'aria-label': `Next page of ${label.toLocaleLowerCase()}` });
  const navigation = el('nav', { class: 'page-actions', 'aria-label': `${label} pages` }, previous, next);
  const node = el('div', { class: 'paged-list', 'data-paged-list': id }, status, list, navigation);
  function paint() {
    const window = pageWindow(all, page, pageSize);
    page = window.page;
    status.textContent = all.length ? `${label} ${window.start + 1}–${window.end} of ${all.length}` : `0 ${label.toLocaleLowerCase()}`;
    previous.disabled = page === 0;
    next.disabled = page === window.pages - 1;
    navigation.hidden = window.pages === 1;
    list.replaceChildren(...(all.length ? window.items.map(renderItem) : [hint(emptyText)]));
  }
  paint();
  return {
    node,
    get page() { return page; },
    refresh: paint,
    setItems(items, { reset = false, revealKey = null } = {}) {
      all = items;
      if (reset) page = 0;
      if (revealKey != null) {
        const index = all.findIndex((item) => key(item) === revealKey);
        if (index !== -1) page = Math.floor(index / pageSize);
      }
      paint();
    },
  };
}
