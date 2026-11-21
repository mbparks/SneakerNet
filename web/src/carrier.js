import { groupThreads, rebuildMailbag, serializeMailbag } from './core.js';

// Outbox records are private pointers to the exact public copies prepared here.
// These views never append a stamp or infer that a file reached another person.
const count = (number, singular, plural = `${singular}s`) => `${number} ${number === 1 ? singular : plural}`;
const excerpt = (text, limit = 90) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
const displayDate = (value) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(value));
const searchText = (value) => value.normalize('NFKC').toLocaleLowerCase();

function receiptSummary(receipt, messagesById) {
  const messages = receipt.messageIds.map((id) => messagesById.get(id)).filter(Boolean);
  const threads = groupThreads({ messages });
  const first = threads[0];
  const title = first?.root ? excerpt(first.root.body.split('\n')[0])
    : first ? `Reply ahead of its postcard · ${excerpt(first.messages[0]?.body || '', 54)}`
      : 'Packed postcards';
  return {
    title, messages, threadCount: threads.length,
    searchable: searchText(`${receipt.bagId} ${messages.map((message) => `${message.handle} ${message.body}`).join(' ')}`),
  };
}

export function showOutbox(desk, api) {
  const receipts = [...(desk.local?.outbox || [])].reverse();
  if (!receipts.length) {
    api.openModal('Outbox', [
      api.el('div', { class: 'experience-empty' }, api.el('span', { class: 'eyebrow' }, 'PACKED AT THIS DESK'),
        api.el('h3', {}, 'No packing receipts yet.'),
        api.el('p', {}, 'Choose the threads you are willing to carry, then pack a mailbag. Its original contents and packing receipt will be kept here.')),
      api.hint('The outbox begins with bags packed in this version. Earlier postcard paths remain on the desk; old bag records are not invented.'),
      api.hint('This is private packing history. It does not confirm that a download was saved, transferred, or delivered.'),
      api.el('div', { class: 'modal-actions' }, api.button('Back to the desk', api.closeModal, 'secondary', { 'data-autofocus': true })),
    ], { wide: true });
    return;
  }

  // Build light summaries once. Reconstruct a public bag only when its receipt
  // is opened, rather than validating the whole mail graph for every list row.
  const messagesById = new Map(desk.messages.map((message) => [message.id, message]));
  const entries = receipts.map((receipt) => ({ receipt, ...receiptSummary(receipt, messagesById) }));
  let page = 0;
  const pageSize = 12;
  const list = api.el('ol', { class: 'outbox-list', 'aria-label': 'Packed mailbags' });
  const results = api.el('p', { id: 'outbox-results', class: 'hint', role: 'status', tabindex: '-1' });
  const pager = api.el('nav', { class: 'outbox-pagination', 'aria-label': 'Outbox pages' });
  const search = api.el('input', {
    id: 'outbox-search', type: 'search', autocomplete: 'off',
    placeholder: 'Postcard text, handle, or bag ID', 'aria-describedby': 'outbox-results', 'data-autofocus': true,
    oninput: () => { page = 0; renderEntries(); },
  });

  function movePage(delta) {
    page += delta;
    renderEntries();
    results.focus();
  }
  function renderEntries() {
    const query = searchText(search.value.trim());
    const matching = entries.filter((entry) => entry.searchable.includes(query));
    const pages = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pages - 1);
    const shown = matching.slice(page * pageSize, (page + 1) * pageSize);
    results.textContent = matching.length ? `${count(matching.length, 'packed bag')}${pages > 1 ? ` · page ${page + 1} of ${pages}` : ''}.`
      : 'No packed bags match. Try another word or clear the search.';
    list.replaceChildren(...shown.map(({ receipt, title, threadCount }) => {
      const titleId = `outbox-title-${receipt.bagId}`;
      return api.el('li', { class: 'outbox-entry', 'data-bag-id': receipt.bagId },
        api.el('span', { class: 'outbox-seal', 'aria-hidden': true }, 'PACKED'),
        api.el('div', { class: 'outbox-content' },
          api.el('h3', { id: titleId }, title),
          api.el('p', { class: 'outbox-time' }, 'Packed ', api.el('time', { datetime: receipt.packedAt }, displayDate(receipt.packedAt)), ' · station clock'),
          api.el('p', { class: 'outbox-counts' }, `${count(threadCount, 'thread')} · ${count(receipt.messageIds.length, 'postcard')} · ${count(receipt.pathHeads.length, 'known path')}`)),
        api.button('View packing receipt', () => showPackingReceipt(desk, receipt.bagId, api), 'secondary', { 'data-receipt': true, 'aria-describedby': titleId }));
    }));
    pager.replaceChildren(...(pages > 1 ? [
      api.button('Newer bags', () => movePage(-1), 'secondary', { id: 'outbox-newer', disabled: page === 0 }),
      api.el('span', { class: 'hint' }, `${page + 1} / ${pages}`),
      api.button('Older bags', () => movePage(1), 'secondary', { id: 'outbox-older', disabled: page === pages - 1 }),
    ] : []));
  }

  api.openModal('Outbox', [
    api.el('p', {}, 'Bags packed at this desk, most recent packing first. Open a receipt to inspect its original contents or download that same bag again.'),
    api.hint('The order follows your packing record, even if station clocks disagree. These private receipts do not confirm saving, transfer, or delivery.'),
    api.el('div', { class: 'field outbox-search' }, api.el('label', { for: 'outbox-search' }, 'Find a packed bag'), search),
    results, list, pager,
    api.hint('Up to 100 recent packing receipts are kept within the outbox storage budget. An older receipt can leave this list without removing any postcard or recorded path.'),
    api.el('div', { class: 'modal-actions' }, api.button('Back to the desk', api.closeModal, 'secondary')),
  ], { wide: true });
  renderEntries();
}

export function showPackingReceipt(desk, bagId, api) {
  let bag, serialized;
  try {
    bag = rebuildMailbag(desk, bagId);
    serialized = serializeMailbag(bag);
  } catch (error) {
    api.openModal('Packing receipt unavailable', [
      api.el('div', { class: 'notice error', role: 'alert' }, error.message),
      api.el('p', {}, 'This receipt could not be reconstructed. The desk has not changed. Use a file you already kept, or review the current threads before packing a new bag.'),
      api.el('div', { class: 'modal-actions' }, api.button('Back to outbox', () => showOutbox(desk, api), 'secondary', { id: 'outbox-back', 'data-autofocus': true })),
    ], { wide: true });
    return;
  }

  const threads = groupThreads({ messages: bag.messages });
  const status = api.el('p', { class: 'hint outbox-download-status', role: 'status' });
  const download = api.button('Download same bag', async () => {
    if (download.disabled) return;
    download.disabled = true;
    status.textContent = 'Preparing the original bag for download…';
    try {
      const started = await api.downloadBag(bag.id);
      status.textContent = started === false ? 'The download did not start. The saved packing receipt is unchanged.'
        : 'Download started with the original bag ID and contents. No new postcard or handoff stamp was added.';
    } catch (error) {
      status.textContent = `The download could not start: ${error.message} The saved packing receipt is unchanged.`;
    } finally { download.disabled = false; }
  }, 'primary', { id: 'outbox-download' });
  const receipt = api.el('section', { class: 'packing-receipt', 'data-bag-id': bag.id },
    api.el('div', { class: 'packing-receipt-heading' },
      api.el('span', { class: 'outbox-seal receipt-seal', 'aria-hidden': true }, 'PACKED'),
      api.el('div', {}, api.el('p', { class: 'eyebrow' }, 'ORIGINAL PUBLIC CONTENTS'),
        api.el('h3', {}, 'A record of what you packed'),
        api.el('p', { class: 'hint' }, api.el('time', { datetime: bag.packedAt }, displayDate(bag.packedAt)), ' · packing station clock'))),
    api.el('div', { class: 'packing-summary' }, api.badge(count(threads.length, 'thread')), api.badge(count(bag.messages.length, 'postcard')), api.badge(count(bag.routes.length, 'known path'))),
    api.hint('These are the messages and paths in the original bag. Later replies, new paths, and changes to your station do not alter this receipt.'),
    api.el('details', { class: 'record-details' }, api.el('summary', {}, 'Bag identity & private receipt'),
      api.el('p', { class: 'record-id' }, 'Bag ID: ', api.el('code', {}, bag.id)),
      api.el('p', {}, 'This receipt stays on your desk and in its private backup. It records packing, not successful saving, transfer, or delivery. The mailbag itself remains public plain text.'),
      api.el('p', {}, 'Postmarks, handles, and times are supplied by participants. Each known path remains a separate recorded copy.')),
    api.manifest(bag), api.rawManifest(bag, serialized));

  api.openModal('Packing receipt', [receipt,
    api.el('div', { class: 'packing-repeat-note' },
      api.el('h3', {}, 'Carry it again'),
      api.el('p', {}, 'Download same bag keeps the original bag ID and exact contents. A desk that already accepted it will add nothing when opening it again.'),
      api.el('p', {}, 'Pack current threads opens a new review with the mail and paths you know now. A new bag receives fresh packed stamps.')),
    status,
    api.el('div', { class: 'modal-actions packing-actions sticky-actions' },
      api.button('Back to outbox', () => showOutbox(desk, api), 'quiet', { id: 'outbox-back' }),
      api.button('Pack current threads', () => api.packThreads(bag.messages.map((message) => message.id)), 'secondary', { id: 'outbox-pack-current' }),
      download),
  ], { wide: true });
}
