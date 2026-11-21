import { VERSION } from './core.js';

// These views read public postcards and this desk's private receipt history.
// They never change a mailbag, infer a place, or combine separate copy paths.
const labels = { written: 'Written', packed: 'Packed for travel', received: 'Opened at this station' };
const count = (number, singular, plural = `${singular}s`) => `${number} ${number === 1 ? singular : plural}`;
const excerpt = (text, limit = 90) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
const displayDate = (value) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(value));
const unique = (values) => [...new Set(values)];
const getArrival = (desk, arrivalId) => (desk.local?.arrivals || []).find((arrival) => arrival.bagId === arrivalId);

function receiptDetails(desk, arrival, { includePaths = true } = {}) {
  const byId = new Map(desk.messages.map((message) => [message.id, message]));
  const newIds = new Set(arrival.newMessageIds);
  const receiptKeys = new Set(arrival.pathReceipts.map(({ messageId, markId }) => JSON.stringify([messageId, markId])));
  const orderedIds = unique([...arrival.newMessageIds, ...arrival.pathReceipts.map(({ messageId }) => messageId), ...arrival.messageIds]);
  const messages = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const newMessages = messages.filter((message) => newIds.has(message.id));
  const arrivingPaths = [];
  // A receipt may now sit inside more than one longer branch. Retain the
  // recorded prefix for this opening, once per actual receipt ID.
  const foundReceipts = new Set();
  for (const route of includePaths ? desk.routes : []) {
    for (let index = 0; index < route.path.length; index++) {
      const key = JSON.stringify([route.messageId, route.path[index].id]);
      if (receiptKeys.has(key) && !foundReceipts.has(key)) {
        foundReceipts.add(key);
        arrivingPaths.push({ messageId: route.messageId, path: route.path.slice(0, index + 1) });
      }
    }
  }
  return {
    messages, newIds, arrivingPaths,
    newPosts: newMessages.filter((message) => !message.parentId).length,
    newReplies: newMessages.filter((message) => Boolean(message.parentId)).length,
    knownCount: messages.length - newMessages.length,
    pathCount: receiptKeys.size,
  };
}

function emptyView(title, message, api) {
  api.openModal(title, [
    api.el('div', { class: 'experience-empty' }, api.el('h3', {}, 'Nothing here yet.'), api.el('p', {}, message)),
    api.el('div', { class: 'modal-actions' }, api.button('Back to the desk', api.closeModal, 'secondary', { 'data-autofocus': true })),
  ], { wide: true });
}

export function showMailCall(desk, arrivalId, api) {
  const arrival = getArrival(desk, arrivalId);
  if (!arrival) {
    emptyView('Mail call', 'This opening is no longer in the recent-arrivals list. Its postcards and recorded paths remain on your desk.', api);
    return;
  }
  const details = receiptDetails(desk, arrival);
  const sessionRead = new Set(desk.local?.readMessageIds || []);
  const marksByMessage = new Map();
  for (const receipt of arrival.pathReceipts) {
    if (!marksByMessage.has(receipt.messageId)) marksByMessage.set(receipt.messageId, new Set());
    marksByMessage.get(receipt.messageId).add(receipt.markId);
  }

  function showSummary() {
    const stat = (number, text) => api.el('div', { class: 'mini-stat' }, api.el('strong', {}, number), api.el('span', {}, text));
    const postmarks = unique(details.arrivingPaths.flatMap((route) => route.path.map((mark) => mark.postmark).filter(Boolean)));
    const intro = api.el('div', { class: 'mail-call-intro' },
      api.el('span', { class: 'mail-call-seal', 'aria-hidden': true }, 'MAIL\nCALL'),
      api.el('div', {}, api.el('p', { class: 'eyebrow' }, 'A bag has reached your desk'),
        api.el('h3', {}, details.newPosts + details.newReplies ? 'See what came back.' : details.pathCount ? 'A familiar postcard. Another path.' : 'Familiar mail, safely accounted for.'),
        api.el('p', { class: 'hint' }, 'Opened at this desk ', api.el('time', { datetime: arrival.receivedAt }, displayDate(arrival.receivedAt)), '.')));
    const summary = api.el('section', { class: 'mail-call-summary', 'data-bag-id': arrival.bagId }, intro,
      api.el('div', { class: 'summary-grid' },
        stat(details.newPosts, 'new posts'), stat(details.newReplies, 'new replies'),
        stat(details.knownCount, 'known postcards'), stat(details.pathCount, 'arriving paths')),
      postmarks.length ? api.el('div', { class: 'arrival-postmarks' },
        api.el('p', { class: 'eyebrow' }, 'Supplied postmarks on these paths'),
        api.el('div', { class: 'stamp-labels' }, postmarks.slice(0, 12).map((postmark) => api.badge(postmark))),
        postmarks.length > 12 ? api.hint(`And ${count(postmarks.length - 12, 'more label')}. Turn the postcards over to see each recorded path.`) : null) : null,
      api.hint('Opening this summary leaves unread postcards unread. Start reading to open them one at a time; turn each card over to inspect its postmarks.'),
      api.el('details', { class: 'arrival-record' }, api.el('summary', {}, 'About this opening'),
        api.el('p', {}, 'This is this desk’s record of accepting a mailbag. Station labels and times are supplied by participants. They do not verify a person, a place, or physical delivery.'),
        api.el('p', {}, 'The postcards below reflect what this desk knows now. Highlighted receipt stamps identify this opening, even when a path has since continued.'),
        api.el('p', { class: 'record-id' }, 'Bag ID: ', api.el('code', {}, arrival.bagId))));
    api.openModal('Mail call', [summary,
      api.el('div', { class: 'modal-actions' },
        api.button('Recent arrivals', () => showArrivalHistory(desk, api), 'quiet'),
        api.button('Back to the desk', api.closeModal, 'secondary'),
        details.messages.length ? api.button('Start reading', () => readAt(0), 'primary', { id: 'mail-call-start', 'data-autofocus': true }) : null),
    ], { wide: true });
  }

  function readAt(index) {
    const message = details.messages[index];
    if (!message) return;
    const readStatus = api.el('p', { class: 'hint mail-call-read-status', role: 'status' });
    const heading = api.el('h3', { tabindex: '-1', 'data-autofocus': true }, `Postcard ${index + 1} of ${details.messages.length}`);
    const reader = api.el('section', { class: 'mail-call-reader', 'data-message-id': message.id },
      api.el('div', { class: 'mail-call-position' }, api.el('div', {}, api.el('p', { class: 'eyebrow' }, 'From this opening'), heading),
        api.badge(details.newIds.has(message.id) ? message.parentId ? 'New reply' : 'New post' : marksByMessage.has(message.id) ? 'New path · known postcard' : 'Already known')),
      api.renderPostcard(message, desk, { practice: false, highlightMarks: marksByMessage.get(message.id) || new Set() }),
      readStatus,
      api.el('div', { class: 'mail-call-thread-link' }, api.button('Read the whole thread', () => api.openThread(message.id), 'quiet')));
    api.openModal('Mail call', [reader,
      api.el('nav', { class: 'modal-actions mail-call-nav sticky-actions', 'aria-label': 'Read this mailbag' },
        api.button('Bag summary', showSummary, 'quiet', { id: 'mail-call-summary' }),
        api.button('Previous postcard', () => readAt(index - 1), 'secondary', { id: 'mail-call-prev', disabled: index === 0 }),
        index < details.messages.length - 1
          ? api.button('Next postcard', () => readAt(index + 1), 'primary', { id: 'mail-call-next' })
          : api.button('Back to the desk', api.closeModal, 'primary', { id: 'mail-call-next' })),
    ], { wide: true });
    if (!sessionRead.has(message.id)) {
      // Reading is an explicit action. Summary and history views never call
      // this hook, and a failed persistence write is not reported as saved.
      Promise.resolve().then(() => api.markRead([message.id])).then((saved) => {
        if (saved === false) readStatus.textContent = 'The postcard is open, but its read marker could not be saved. Your mail is still here.';
        else sessionRead.add(message.id);
      }).catch(() => {
        readStatus.textContent = 'The postcard is open, but its read marker could not be saved. Try opening it again after the desk is saving normally.';
      });
    }
  }

  showSummary();
}

export function showArrivalHistory(desk, api) {
  const arrivals = [...(desk.local?.arrivals || [])].reverse();
  if (!arrivals.length) {
    emptyView('Recent arrivals', 'When you accept a mailbag, its opening will appear here. Reopening the same bag does not add another arrival.', api);
    return;
  }
  const list = api.el('ol', { class: 'arrival-list' }, arrivals.map((arrival, index) => {
    const details = receiptDetails(desk, arrival, { includePaths: false });
    return api.el('li', { class: 'arrival-entry', 'data-bag-id': arrival.bagId },
      api.el('div', { class: 'arrival-number', 'aria-hidden': true }, String(arrivals.length - index).padStart(2, '0')),
      api.el('div', { class: 'arrival-content' },
        api.el('h3', {}, 'Opened at this desk'),
        api.el('time', { datetime: arrival.receivedAt }, displayDate(arrival.receivedAt)),
        api.el('p', {}, `${count(details.newPosts, 'new post')} · ${count(details.newReplies, 'new reply')} · ${count(details.pathCount, 'arriving path')}`),
        api.hint(`${count(details.knownCount, 'already-known postcard')}. Bag ${arrival.bagId}.`)),
      api.button('Open this arrival', () => showMailCall(desk, arrival.bagId, api), 'secondary'));
  }));
  api.openModal('Recent arrivals', [
    api.hint('Recent mailbag openings, newest first in the order this desk accepted them. The list is kept only on this desk and in its private backup; repeated bags do not add entries.'),
    list,
    api.hint('This history keeps up to 100 recent openings within its storage budget. Older postcards and their recorded paths stay on the desk.'),
    api.el('div', { class: 'modal-actions' }, api.button('Back to the desk', api.closeModal, 'secondary', { 'data-autofocus': true })),
  ], { wide: true });
}

function collectAlbum(desk) {
  const messages = new Map(desk.messages.map((message) => [message.id, message]));
  const entries = new Map();
  for (const route of desk.routes) {
    if (!messages.has(route.messageId)) continue;
    for (const mark of route.path) {
      const key = JSON.stringify([mark.stationId, mark.handle, mark.postmark]);
      if (!entries.has(key)) entries.set(key, {
        stationId: mark.stationId, handle: mark.handle, postmark: mark.postmark, messageIds: new Set(),
      });
      entries.get(key).messageIds.add(route.messageId);
    }
  }
  return [...entries.values()].map((entry) => ({
    ...entry,
    messages: [...entry.messageIds].map((id) => messages.get(id)),
    searchText: `${entry.postmark} ${entry.handle}`.normalize('NFKC').toLocaleLowerCase(),
  })).sort((a, b) => (a.postmark || '\uffff').localeCompare(b.postmark || '\uffff') || a.handle.localeCompare(b.handle) || a.stationId.localeCompare(b.stationId));
}

export function showPostmarkAlbum(desk, api) {
  const entries = collectAlbum(desk);
  if (!entries.length) {
    emptyView('Postmark album', 'The station stamps on your postcards will collect here. Write a postcard or accept a mailbag to begin.', api);
    return;
  }
  let page = 0;
  const pageSize = 24;
  const results = api.el('div', { class: 'album-grid' });
  const resultStatus = api.el('p', { id: 'album-results', class: 'hint', role: 'status' });
  const pager = api.el('nav', { class: 'album-pagination', 'aria-label': 'Postmark album pages' });
  const search = api.el('input', {
    id: 'album-search', type: 'search', autocomplete: 'off', placeholder: 'Find a postmark or handle',
    'aria-describedby': 'album-results', 'data-autofocus': true,
    oninput: () => { page = 0; renderEntries(); },
  });
  function renderEntries() {
    const query = search.value.trim().normalize('NFKC').toLocaleLowerCase();
    const matching = entries.filter((entry) => entry.searchText.includes(query));
    const pages = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pages - 1);
    const shown = matching.slice(page * pageSize, (page + 1) * pageSize);
    resultStatus.textContent = matching.length ? `${count(matching.length, 'station label')}${pages > 1 ? ` · page ${page + 1} of ${pages}` : ''}.` : 'No postmarks or handles match. Try another word.';
    results.replaceChildren(...shown.map((entry) => api.el('article', { class: 'album-entry', 'data-station-id': entry.stationId },
      api.el('div', { class: 'album-stamp' }, api.el('p', { class: 'eyebrow' }, 'Participant-supplied'),
        api.el('h3', {}, entry.postmark || 'No place postmark'), api.el('p', { class: 'album-handle' }, entry.handle)),
      api.el('p', { class: 'album-count' }, `On ${count(entry.messages.length, 'postcard')}`),
      api.el('details', { class: 'album-associated' }, api.el('summary', {}, 'Open a related postcard'),
        api.el('ul', {}, entry.messages.map((message) => api.el('li', {}, api.button(
          `${message.handle}: ${excerpt(message.body)}`, () => api.openThread(message.id), 'quiet', { 'data-message-id': message.id }))))))));
    pager.replaceChildren(...(pages > 1 ? [
      api.button('Previous stamps', () => { page--; renderEntries(); search.focus(); }, 'secondary', { disabled: page === 0 }),
      api.el('span', { class: 'hint' }, `${page + 1} / ${pages}`),
      api.button('Next stamps', () => { page++; renderEntries(); search.focus(); }, 'secondary', { disabled: page === pages - 1 }),
    ] : []));
  }
  api.openModal('Postmark album', [
    api.hint('Collected from the actual paths on your postcards. A label is a participant’s own claim; it does not verify a location or identity. A changed handle or label gets its own entry.'),
    api.el('div', { class: 'field album-search' }, api.el('label', { for: 'album-search' }, 'Find a stamp'), search),
    resultStatus, results, pager,
    api.el('div', { class: 'modal-actions' }, api.button('Back to the desk', api.closeModal, 'secondary')),
  ], { wide: true });
  renderEntries();
}

function publicKeepsake(desk, thread) {
  const messages = thread.messages.map(({ id, parentId, handle, body, createdAt }) => ({ id, parentId, handle, body, createdAt }));
  const messageIds = new Set(messages.map((message) => message.id));
  const routes = desk.routes.filter((route) => messageIds.has(route.messageId)).map((route) => ({
    messageId: route.messageId,
    path: route.path.map(({ id, stationId, handle, postmark, kind, at }) => ({ id, stationId, handle, postmark, kind, at })),
  }));
  return { messages, routes };
}

function keepsakePages(snapshot, api) {
  const messageById = new Map(snapshot.messages.map((message) => [message.id, message]));
  return snapshot.messages.flatMap((message, index) => {
    const paths = snapshot.routes.filter((route) => route.messageId === message.id);
    const source = `Postcard ${index + 1} of ${snapshot.messages.length}`;
    const header = (side) => api.el('header', { class: 'keepsake-heading' },
      api.el('div', {}, api.el('p', { class: 'eyebrow' }, 'Green Shoe Garage · Field Instrument'), api.el('h3', {}, 'Sneakernet Social Club')),
      api.el('p', { class: 'keepsake-side' }, `${source} · ${side}`));
    const footer = () => api.el('footer', { class: 'keepsake-footer' },
      api.el('p', {}, `Sneakernet Social Club v${VERSION} · Public conversation keepsake`),
      api.el('p', {}, 'Postcard ID: ', api.el('code', {}, message.id)));
    const front = api.el('section', { class: 'keepsake-page keepsake-front', 'data-message-id': message.id },
      header('front'),
      api.el('div', { class: 'keepsake-author' }, api.el('p', { class: 'eyebrow' }, message.parentId ? 'A reply from' : 'A public postcard from'), api.el('h4', {}, message.handle),
        api.el('p', {}, 'Participant’s recorded writing time: ', api.el('time', { datetime: message.createdAt }, message.createdAt))),
      message.parentId ? api.el('div', { class: 'keepsake-parent' },
        api.el('p', {}, 'Reply to postcard: ', api.el('code', {}, message.parentId)),
        messageById.has(message.parentId) ? api.el('p', {}, `By ${messageById.get(message.parentId).handle}: ${excerpt(messageById.get(message.parentId).body, 140)}`) : api.el('p', {}, 'The parent postcard is not yet on this desk.')) : null,
      api.el('div', { class: 'keepsake-body' }, message.body), footer());
    const back = api.el('section', { class: 'keepsake-page keepsake-back', 'data-message-id': message.id },
      header('postmarks'),
      api.el('p', { class: 'keepsake-claim-note' }, 'These station labels, handles, actions, and times are supplied by participants. They are not verified locations, identities, or proof of physical delivery. Each known path is shown separately, in recorded handoff order. Participant clocks may disagree.'),
      paths.length ? paths.map((route, pathIndex) => api.el('section', { class: 'keepsake-path', 'data-path-index': pathIndex + 1 },
        api.el('h4', {}, `Known path ${pathIndex + 1} of ${paths.length}`),
        api.el('ol', { class: 'keepsake-journey' }, route.path.map((mark) => api.el('li', { class: 'keepsake-mark' },
          api.el('div', { class: 'keepsake-stamp' }, api.el('strong', {}, mark.postmark || 'No place postmark'), api.el('span', {}, mark.handle)),
          api.el('div', { class: 'keepsake-mark-caption' }, api.el('strong', {}, labels[mark.kind]), api.el('p', {}, 'Recorded time: ', api.el('time', { datetime: mark.at }, mark.at))))))))
        : api.el('p', {}, 'No recorded paths accompany this postcard.'),
      footer());
    return [front, back];
  });
}

export function showPrintKeepsake(desk, thread, api) {
  if (!thread?.messages?.length) {
    emptyView('Print a keepsake', 'Open a conversation first to print its public postcards and known paths.', api);
    return;
  }
  // Snapshot only the public fields. Private drafts, filters, station settings,
  // read markers, bookmarks and arrival history never enter the print tree.
  const snapshot = publicKeepsake(desk, thread);
  const feedback = api.el('p', { class: 'hint keepsake-feedback', role: 'status' });
  let cleanupPrint = null;
  function printKeepsake() {
    if (cleanupPrint) cleanupPrint();
    document.getElementById('print-sheet')?.remove();
    const sheet = api.el('div', { id: 'print-sheet', 'aria-hidden': true }, keepsakePages(snapshot, api));
    cleanupPrint = () => {
      sheet.remove();
      document.body.classList.remove('printing-keep');
      window.removeEventListener('afterprint', cleanupPrint);
      cleanupPrint = null;
    };
    document.body.append(sheet);
    document.body.classList.add('printing-keep');
    window.addEventListener('afterprint', cleanupPrint, { once: true });
    try {
      window.print();
    } catch (error) {
      cleanupPrint?.();
      feedback.textContent = 'The browser could not open printing. Your conversation is unchanged; you can try the Print button again.';
    }
  }
  api.openModal('Print a keepsake', [
    api.hint(`${count(snapshot.messages.length, 'postcard')}, with a text front and a postmark back for each. All known paths are kept separate. The printout contains public mail; your private desk settings and drafts stay out.`),
    api.hint('The print dialog can print on paper or save a PDF where the browser supports it. Long backs continue onto extra pages; these are document pages, not automatic two-sided postcard printing.'),
    api.el('div', { class: 'keepsake-preview' }, keepsakePages(snapshot, api)),
    feedback,
    api.el('div', { class: 'modal-actions sticky-actions' },
      api.button('Back to the desk', api.closeModal, 'secondary'),
      api.button('Print keepsake', printKeepsake, 'primary', { id: 'keepsake-print', 'data-autofocus': true })),
  ], { wide: true });
}
