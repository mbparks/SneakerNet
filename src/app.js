import { VERSION, LIMITS, newDesk, validateDesk, validateDrafts, createMessage, groupThreads, prepareMailbag, previewMailbag, acceptMailbag, serializeMailbag, serializeBackup, parseBackup, markMessagesRead, setThreadFlag, threadFacts, markBackupStarted, rebuildMailbag, packingFacts, createDeskIndex, deskCapacity, readingFacts, recordReading } from './core.js';
import { loadDesk, saveDesk, saveDrafts, requestPersistence, subscribeChanges } from './storage.js';
import { showMailCall, showArrivalHistory, showPostmarkAlbum, showPrintKeepsake } from './experience.js';
import { showOutbox, showPackingReceipt } from './carrier.js';
import { createPagedList } from './desk-view.js';
import { createThreadReader, readingWindow } from './reader.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'checked') node.checked = Boolean(value);
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
};
const button = (label, action, kind = 'secondary', attrs = {}) => el('button', { type: 'button', class: `button ${kind}`, onclick: action, ...attrs }, label);
const hint = (text) => el('p', { class: 'hint' }, text);
const badge = (text) => el('span', { class: 'badge' }, text);
const field = (label, input, help) => el('div', { class: 'field' }, el('label', { for: input.id }, label), input, help ? hint(help) : null);
const short = (text, n = 78) => text.length > n ? `${text.slice(0, n - 1)}…` : text;
const nowName = () => new Date().toISOString().replace(/[:.]/g, '-');
const bagFilename = (bag) => `sneakernet-mailbag-${bag.packedAt.replace(/[:.]/g, '-')}-${bag.id.slice(-8)}.json`;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const date = (value) => dateFormatter.format(new Date(value));
const kinds = { written: 'Written', packed: 'Packed for travel', received: 'Opened at this station' };
let desk = newDesk();
let revision = 0;
let selectedThread = null;
let deskIndex = null;
let boardView = null;
let resetBoardPage = true;
let revealThread = null;
let readerSnapshot = null;
let readerThread = null;
let readerAnchor = null;
let renderedAnchor = null;
let renderedReturn = null;
let readerView = null;
let readingRequest = 0;
let parentReturns = [];
let flipped = new Set();
let saveChain = Promise.resolve();
let queuedWrites = 0;
let saveFailure = '';
let bootFailure = false;
let unreadableDesk = null;
let offlineReady = false;
let externalChange = false;
let modalReturnFocus = null;
let restoreModalFocus = true;
let fileReadSerial = 0;
// Unsaved typing stays separate from the committed mail graph. A draft patch
// never replaces public mail, and each queued edit has its own identity so a
// slower save cannot erase newer keystrokes.
const draftEdits = new Map();
const queuedDraftEdits = new Set();
let draftSequence = 0;
let draftTimer;
let draftFailure = '';

// Saved snapshots are replaced atomically. Reuse derived lookups while a person
// searches or turns a page. The index itself is never stored or exported.
function currentIndex() {
  if (deskIndex?.desk !== desk) deskIndex = createDeskIndex(desk);
  return deskIndex;
}
const pagingAPI = { el, button, hint };

function tell(message, type = 'success', extra = null) {
  $('notice').hidden = false;
  $('notice').replaceChildren(el('div', { class: `notice ${type}`, role: type === 'error' ? 'alert' : 'status' }, el('span', {}, message), typeof extra === 'function' ? extra() : extra));
  if ($('modal').open) {
    let localNotice = $('modal-body').querySelector('.modal-notice');
    if (!localNotice) { localNotice = el('div', { class: 'modal-notice' }); $('modal-body').prepend(localNotice); }
    localNotice.replaceChildren(el('div', { class: `notice ${type}`, role: type === 'error' ? 'alert' : 'status' }, message, typeof extra === 'function' ? extra() : null));
    if (type === 'error') $('modal').scrollTop = 0;
  }
}
function saveStatus() {
  const saving = queuedWrites || draftEdits.size;
  $('save-status').textContent = saveFailure ? 'Not saved — back up this tab' : saving ? 'Saving on this device…' : 'Saved on this device';
  $('save-status').dataset.state = saveFailure ? 'error' : saving ? 'saving' : 'saved';
}
function applyDraftEdits(base, edits) {
  const next = { post: base.post, replies: { ...base.replies } };
  for (const [key, edit] of edits) {
    if (key === null) next.post = edit.value;
    else if (edit.value) next.replies[key] = edit.value;
    else delete next.replies[key];
  }
  return next;
}
function currentDrafts() { return applyDraftEdits(desk.drafts, draftEdits); }
function queueDraft(parentId, value) {
  draftEdits.set(parentId, { value, sequence: ++draftSequence });
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDrafts, 250);
  saveStatus();
  updatePrivateSummary();
}
function downloadDraftRescue() {
  downloadJSON({ format: 'sneakernet-social-club/private-draft-rescue', version: 1, capturedAt: new Date().toISOString(), drafts: currentDrafts() }, `sneakernet-private-drafts-${nowName()}.json`);
  tell('Private draft rescue download started. This is a readable copy of your drafts; it is not a mailbag or a restorable full-desk backup.');
}
function flushDrafts() {
  clearTimeout(draftTimer);
  const edits = [...draftEdits].filter(([, edit]) => !queuedDraftEdits.has(edit.sequence));
  if (!edits.length) return saveChain;
  for (const [, edit] of edits) queuedDraftEdits.add(edit.sequence);
  queuedWrites++;
  saveStatus();
  const operation = saveChain.then(async () => {
    try {
      if (bootFailure) throw new Error('The saved desk could not be opened. Keep a rescue copy of this draft.');
      if (externalChange) throw new Error('Another tab saved this desk. Download your draft, then reload before saving here.');
      const drafts = validateDrafts(applyDraftEdits(desk.drafts, edits));
      const result = await saveDrafts(drafts, revision);
      desk = { ...desk, drafts };
      revision = result.revision;
      for (const [key, edit] of edits) if (draftEdits.get(key)?.sequence === edit.sequence) draftEdits.delete(key);
      if (!draftEdits.size) draftFailure = '';
      saveFailure = draftEdits.size ? draftFailure : '';
      updatePrivateSummary();
      return true;
    } catch (error) {
      draftFailure = error.message;
      saveFailure = draftFailure;
      tell(`${error.message} Your latest text is still in this tab.`, 'error', () => el('div', { class: 'modal-actions' }, button('Retry saving draft', flushDrafts, 'quiet'), button('Download private draft copy', downloadDraftRescue, 'quiet')));
      return false;
    } finally {
      for (const [, edit] of edits) queuedDraftEdits.delete(edit.sequence);
      queuedWrites--;
      saveStatus();
    }
  });
  saveChain = operation.catch(() => {});
  return operation;
}
function commit(transform, { render = true, flush = true } = {}) {
  if (flush) flushDrafts();
  queuedWrites++;
  saveStatus();
  const operation = saveChain.then(async () => {
    let next;
    try {
      if (flush && draftEdits.size) throw new Error('A private draft is still unsaved. Retry its save or download a private copy before changing this desk.');
      next = typeof transform === 'function' ? await transform(desk) : transform;
      next = validateDesk(next);
      if (bootFailure) throw new Error('The saved desk could not be read. Restore a backup or download the recovery copy before starting a fresh desk.');
      if (externalChange) throw new Error('Another tab saved this desk. Back up the work in this tab, then reload to open the saved version.');
      const result = await saveDesk(next, revision);
      desk = next;
      revision = result.revision;
      if (!draftEdits.size) draftFailure = '';
      saveFailure = draftEdits.size ? draftFailure : '';
      if (render) renderDesk();
      return true;
    } catch (error) {
      // Public actions stay transactional. Private typing lives in draftEdits
      // until its own guarded patch succeeds, and is available for rescue.
      saveFailure = error.message;
      tell(`${error.message} Your working copy is still in this tab.`, 'error', () => button('Back up this tab', exportBackup, 'quiet'));
      if (render) renderDesk();
      return false;
    } finally {
      queuedWrites--;
      saveStatus();
    }
  });
  saveChain = operation.catch(() => {});
  return operation;
}
async function settle() { flushDrafts(); await saveChain; }

// An explicit restore/reset is allowed to replace a newer desk, but it must
// not pair the old in-memory mail with that newer revision if the write fails.
// Adopt the data, revision, and conflict state together only after commit.
function replaceDeskSnapshot(candidate) {
  flushDrafts();
  queuedWrites++;
  saveStatus();
  const operation = saveChain.then(async () => {
    try {
      const next = validateDesk(candidate);
      const current = await loadDesk();
      const result = await saveDesk(next, current.revision);
      desk = next;
      revision = result.revision;
      externalChange = false;
      bootFailure = false;
      unreadableDesk = null;
      draftEdits.clear();
      draftFailure = '';
      saveFailure = '';
      return true;
    } catch (error) {
      saveFailure = error.message;
      tell(`${error.message} The replacement was not saved; this tab and the stored desk have not been deliberately replaced.`, 'error', () => button('Back up this tab', exportBackup, 'quiet'));
      return false;
    } finally {
      queuedWrites--;
      saveStatus();
    }
  });
  saveChain = operation.catch(() => {});
  return operation;
}

function openModal(title, children, { wide = false } = {}) {
  if (!$('modal').open) { modalReturnFocus = document.activeElement; restoreModalFocus = true; }
  $('modal-title').textContent = title;
  $('modal-body').replaceChildren(...[children].flat());
  $('modal').classList.toggle('wide', wide);
  if (!$('modal').open) $('modal').showModal();
  $('modal').scrollTop = 0;
  $('modal-body').scrollTop = 0;
  requestAnimationFrame(() => { if ($('modal').open) ($('modal-body').querySelector('[data-autofocus]') || $('modal-close')).focus(); });
}
function closeModal(options = {}) { flushDrafts(); restoreModalFocus = options.restoreFocus !== false; $('modal').close(); }
function downloadText(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = el('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function downloadJSON(value, filename) { downloadText(`${JSON.stringify(value)}\n`, filename); }
async function exportBackup() {
  await settle();
  try {
    if (bootFailure) {
      if (unreadableDesk == null) { tell('The browser could not read the saved record, so a backup cannot be made here. The stored record is still untouched. Keep this browser profile and restore a known backup in a separate installation.', 'error'); return; }
      downloadJSON({ format: 'sneakernet-social-club/recovery', version: 1, capturedAt: new Date().toISOString(), storedDesk: unreadableDesk }, `sneakernet-recovery-${nowName()}.json`);
      tell('An unmodified recovery copy of the unreadable desk is downloading. Keep it private. It needs repair before it can be restored; it is not a public mailbag.');
      return;
    }
    const at = new Date().toISOString();
    const backupDesk = markBackupStarted({ ...desk, drafts: currentDrafts() }, at);
    const serialized = serializeBackup(backupDesk);
    downloadText(serialized, `sneakernet-desk-${nowName()}.json`);
    const saved = draftEdits.size ? false : await commit((d) => markBackupStarted(d, at), { render: false, flush: false });
    if (!saved) desk = { ...desk, local: { ...desk.local, lastBackupAt: at } };
    updatePrivateSummary();
    tell(`Full-desk backup download started. It includes your private drafts, reading state and saved places, outbox, station, preferences, and received-mail history. Keep it for yourself.${saved ? '' : ' The download contains this tab’s working copy; local saving still needs attention.'}`, saved ? 'success' : 'info');
  } catch (error) { tell(`The backup could not be made: ${error.message}`, 'error'); }
}

function stationEditor(afterSave) {
  const handle = el('input', { id: 'station-handle', name: 'handle', required: true, maxlength: LIMITS.handle, autocomplete: 'off', placeholder: 'e.g. mbparks', value: desk.station.handle, 'data-autofocus': true });
  const postmark = el('input', { id: 'station-postmark', name: 'postmark', maxlength: LIMITS.postmark, autocomplete: 'off', placeholder: 'e.g. Cumberland Maker Meetup', value: desk.station.postmark });
  const error = el('p', { class: 'form-error', role: 'alert' });
  const form = el('form', { onsubmit: async (event) => {
    event.preventDefault();
    const name = handle.value.trim();
    const place = postmark.value.trim();
    if (!name) { error.textContent = 'Choose a handle for your station.'; handle.focus(); return; }
    let proposed;
    try { proposed = validateDesk({ ...desk, station: { ...desk.station, handle: name, postmark: place } }); }
    catch (failure) { error.textContent = failure.message; return; }
    const okay = await commit((d) => ({ ...d, station: { ...d.station, handle: name, postmark: place } }));
    if (okay) { closeModal(); if (afterSave) afterSave(); }
  } },
  el('div', { class: 'station-intro' }, el('div', { class: 'station-seal', 'aria-hidden': true }, 'SSC'), el('p', {}, 'A handle, a stamp, a place in the chain. You can change these any time; earlier postmarks stay as they were.')),
  field('Your handle', handle),
  field('Your postmark (optional)', postmark, 'Use a club name or a broad place. Leave out street addresses and coordinates.'),
  hint('This handle and optional postmark travel on mail you write, pack, or accept. Postmarks are supplied by participants, not verified locations.'),
  error,
  el('div', { class: 'modal-actions' }, el('button', { type: 'submit', class: 'button primary' }, 'Save station'), button('Cancel', closeModal, 'quiet')));
  openModal('Set your station', form);
}
function withStation(action) { if (!desk.station.handle.trim()) stationEditor(action); else action(); }

function compose(parentId = null) {
  withStation(() => {
    const parent = desk.messages.find((m) => m.id === parentId);
    const drafts = currentDrafts();
    const draft = parentId ? drafts.replies[parentId] || '' : drafts.post;
    const input = el('textarea', { id: 'postcard-message', rows: 7, maxlength: LIMITS.body, required: true, value: draft, placeholder: parentId ? 'Send a little knowledge back along the road…' : 'Who’s got a spare rotary encoder?', 'data-autofocus': true });
    const counter = el('span', { class: 'character-count', 'aria-live': 'off' }, `${draft.length} / ${LIMITS.body}`);
    const error = el('p', { class: 'form-error', role: 'alert' });
    input.addEventListener('input', () => {
      const value = input.value;
      counter.textContent = `${value.length} / ${LIMITS.body}`;
      queueDraft(parentId, value);
    });
    const submit = el('button', { type: 'submit', class: 'button primary' }, parentId ? 'Post reply' : 'Post postcard');
    const form = el('form', { onsubmit: async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      if (!input.value.trim()) { error.textContent = 'Write a little something before posting.'; input.focus(); return; }
      submit.disabled = true;
      const body = input.value;
      input.readOnly = true;
      try {
        let postedId;
        // Build against the snapshot at our turn in the save queue. Closing
        // the form and opening another section must not lose a newer visit.
        const okay = await commit((current) => {
          const result = createMessage(current, { body, parentId });
          if (parentId) delete result.desk.drafts.replies[parentId]; else result.desk.drafts.post = '';
          postedId = result.message.id;
          return recordReading(result.desk, { messageIds: [postedId], anchorId: postedId });
        }, { render: false });
        if (!okay) { error.textContent = 'This postcard has not been posted. Your draft is still here; resolve the save error before trying again.'; submit.disabled = false; input.readOnly = false; return; }
        const stillComposing = $('modal').open && form.isConnected && $('modal-body').contains(form);
        if (stillComposing) {
          selectedThread = currentIndex().messageToThread.get(postedId)?.id;
          revealThread = selectedThread;
          readerAnchor = postedId;
          parentReturns = [];
          readingRequest++;
          closeModal({ restoreFocus: false });
        }
        renderDesk();
        if (stillComposing) readerView?.focusAnchor();
        tell('Postcard is on your desk. Choose “Carry this thread” when you’re ready to send it along.', 'success', stillComposing ? null : () => button('Open posted postcard', () => openThread(postedId), 'quiet'));
        requestPersistence().catch(() => {});
      } catch (failure) { error.textContent = failure.message; submit.disabled = false; input.readOnly = false; }
    } },
    el('div', { class: 'compose-station' }, badge(`From @${desk.station.handle}`), desk.station.postmark ? badge(desk.station.postmark) : badge('No place postmark')),
    parent ? el('blockquote', { class: 'reply-context' }, el('strong', {}, `Replying to @${parent.handle}`), el('p', {}, short(parent.body, 180))) : null,
    field(parentId ? 'Reply message' : 'Postcard message', input),
    el('div', { class: 'compose-caption' }, hint('Private draft autosaves here. Posting makes this text available to carry; it does not send a file.'), counter),
    error,
    el('div', { class: 'modal-actions' }, submit, button('Keep as draft', closeModal, 'quiet')),
    hint('Postcards are public plain text and stay as written. Ctrl / ⌘ + Enter posts your message.'));
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); } });
    openModal(parentId ? 'Write a reply' : 'Write a postcard', form);
  });
}

function threadTitle(thread) { return thread.root ? short(thread.root.body.split('\n')[0]) : `Waiting for a postcard · ${short(thread.messages[0]?.body || '', 48)}`; }
function updatePrivateSummary() {
  const drafts = currentDrafts();
  const draftCount = Number(Boolean(drafts.post)) + Object.values(drafts.replies).filter(Boolean).length;
  $('drafts-button').textContent = draftCount ? `Private drafts · ${draftCount}` : 'Private drafts';
  $('drafts-button').disabled = bootFailure;
  $('arrivals-button').disabled = bootFailure;
  $('album-button').disabled = bootFailure;
  $('outbox-button').disabled = bootFailure;
  $('outbox-button').textContent = desk.local.outbox.length ? `Outbox · ${desk.local.outbox.length}` : 'Outbox';
  $('backup-summary').textContent = desk.local.lastBackupAt ? `Backup download started ${date(desk.local.lastBackupAt)}` : 'No backup download yet';
}
function matchesView(thread, facts, view) {
  if (view === 'all') return true;
  if (view === 'archived') return facts.isArchived;
  if (facts.isArchived) return false;
  if (view === 'unread') return facts.unreadCount > 0;
  if (view === 'replies') return facts.hasNewReplies;
  if (view === 'mine') return facts.isMine;
  if (view === 'carrying') return facts.isCarrying;
  if (view === 'waiting') return Boolean(thread.missingParentId);
  if (view === 'bookmarked') return facts.isBookmarked;
  return true;
}
async function markRead(ids, read = true) {
  // An earlier queued action may still be changing the same IDs. Preserve
  // every explicit read/unread action in the order it was requested.
  return commit((d) => markMessagesRead(d, ids, read));
}
async function openThread(messageId, { resume = false } = {}) {
  const index = currentIndex();
  const thread = index.messageToThread.get(messageId);
  if (!thread) return;
  if ($('modal').open) closeModal({ restoreFocus: false });
  const facts = threadFacts(desk, thread, index);
  const query = $('search').value.trim().toLocaleLowerCase();
  if (!matchesView(thread, facts, $('view-filter').value) || (query && !index.searchTextByThread.get(thread.id).some((text) => text.includes(query)))) {
    $('view-filter').value = 'all';
    $('search').value = '';
  }
  const position = readingFacts(desk, thread, index);
  const anchorId = resume ? position.resumeId || position.firstUnreadId || thread.messages[0]?.id
    : index.messagesById.has(messageId) ? messageId : position.resumeId || position.firstUnreadId || thread.messages[0]?.id;
  return navigateReader({ anchorId, reason: 'open', returnToId: null });
}

async function navigateReader({ anchorId, reason, returnToId = null }) {
  const index = currentIndex();
  const thread = index.messageToThread.get(anchorId);
  if (!thread || !index.messagesById.has(anchorId)) return false;
  const request = ++readingRequest;
  const section = readingWindow(thread, anchorId);
  parentReturns = parentReturns.filter((id) => index.messageToThread.get(id)?.id === thread.id);
  if (reason === 'parent' && index.messageToThread.get(returnToId)?.id === thread.id) parentReturns.push(returnToId);
  else if (reason === 'return') parentReturns.pop();
  else if (reason === 'open' || reason === 'first-unread') parentReturns = [];
  selectedThread = thread.id;
  revealThread = thread.id;
  readerAnchor = section.anchorId;
  if (['parent', 'return', 'first-unread'].includes(reason)) flipped.delete(readerAnchor);
  // Show the requested section immediately. These exact exposed IDs, not a
  // whole thread or an unseen later section, are the pending read operation.
  renderDesk();
  readerView?.focusAnchor();
  // Queue every explicit visit. A pre-save equality shortcut could lose a
  // quick P→Q→P return while Q's older save is still in flight.
  const saved = await commit((current) => recordReading(current, {
    messageIds: section.messageIds, anchorId: section.anchorId,
  }), { render: false });
  // Refresh current badges even after another view has taken over. Rendering
  // preserves the control now in use; completion never refocuses the anchor.
  renderDesk();
  if (!saved && request === readingRequest) tell('Reading can continue. This section’s read state and your place were not saved; resolve the save error before closing the desk.', 'error', () => button('Back up this tab', exportBackup, 'quiet'));
  return true;
}

function resetReader() {
  readingRequest++;
  readerAnchor = null;
  parentReturns = [];
}
function experienceAPI() { return { el, button, hint, badge, openModal, closeModal,
  // Mail Call starts on the front without changing the main desk's open side.
  renderPostcard: (message, source, options) => { flipped.delete(`mail-call:${message.id}`); return renderPostcard(message, source, { ...options, flipScope: 'mail-call' }); },
  markRead, openThread }; }
function carrierAPI() { return { el, button, hint, badge, openModal, closeModal, manifest, rawManifest, downloadBag, packThreads }; }
function packThreads(messageIds) {
  const ids = new Set(messageIds);
  const threads = currentIndex().threads.filter((thread) => thread.messages.some((message) => ids.has(message.id)));
  packChooser(threads.map((thread) => thread.id));
}
async function downloadBag(bagId) {
  await settle();
  try {
    const bag = rebuildMailbag(desk, bagId);
    const serialized = serializeMailbag(bag);
    downloadText(serialized, bagFilename(bag));
    tell('The original bag download started. It keeps the same bag ID, postcards, and postmarks. No new packing record or handoff was added.');
    return true;
  } catch (error) {
    tell(`The original bag could not be downloaded: ${error.message}`, 'error');
    return false;
  }
}
async function changeThreadFlag(threadId, flag, enabled) {
  if (flag === 'archived' && enabled) { selectedThread = null; resetReader(); }
  await commit((d) => setThreadFlag(d, threadId, flag, enabled));
}
function draftsPanel() {
  const drafts = currentDrafts();
  const entries = [];
  if (drafts.post) entries.push({ parentId: null, body: drafts.post });
  for (const [parentId, body] of Object.entries(drafts.replies)) if (body) entries.push({ parentId, body });
  const list = el('div', { class: 'draft-list' }, ...entries.map(({ parentId, body }) => {
    const parent = desk.messages.find((message) => message.id === parentId);
    return el('article', { class: 'draft-item', 'data-parent-id': parentId || '' },
      el('h3', {}, parentId ? parent ? `Reply to @${parent.handle}` : 'Reply waiting for its postcard' : 'A postcard in progress'),
      parent ? hint(short(parent.body, 100)) : null,
      el('p', { class: 'draft-preview' }, short(body, 240)),
      button(parentId ? 'Resume reply' : 'Resume postcard', () => compose(parentId), 'secondary'));
  }));
  openModal('Private drafts', [hint('Only this desk and its full backup contain these drafts. They never travel in a public mailbag.'),
    entries.length ? list : el('div', { class: 'experience-empty' }, el('h3', {}, 'A clear writing desk.'), el('p', {}, 'Start a postcard or a reply, then keep it as a draft to return to it here.')),
    el('div', { class: 'modal-actions' }, button('Write a postcard', () => compose(), 'primary'), button('Back to the desk', closeModal, 'quiet'))]);
}
// Saving replaces the rendered snapshot. Remember the currently used control
// by its postcard/thread identity, rather than returning focus to an old visit.
function captureDeskFocus(active) {
  const region = ['reader', 'board'].map($).find((node) => active && node.contains(active));
  if (!region) return null;
  const messageId = active.closest('[data-message-id]')?.dataset.messageId;
  const threadId = region.id === 'reader' ? readerThread : active.closest('[data-thread-id]')?.dataset.threadId;
  const attribute = ['data-flip', 'data-parent-id', 'data-reply-to', 'data-thread-action'].find((name) => active.hasAttribute(name));
  const attributeValue = attribute ? active.getAttribute(attribute) : null;
  const id = active.id;
  const isCard = active.matches('.postcard');
  const isThreadOpen = active.matches('.thread-open');
  const isCarry = active.matches('input[type="checkbox"]');
  return () => {
    const fallback = region.id === 'reader' ? region.querySelector('.thread-heading h2') || $('view-filter') : $('view-filter');
    if (region.id === 'reader' && threadId !== readerThread) return fallback;
    let scope = region;
    if (messageId) scope = [...region.querySelectorAll('[data-message-id]')].find((node) => node.dataset.messageId === messageId);
    else if (region.id === 'board' && threadId) scope = [...region.querySelectorAll('[data-thread-id]')].find((node) => node.dataset.threadId === threadId);
    if (!scope) return fallback;
    let target;
    if (isCard) { target = scope; target.setAttribute('tabindex', '-1'); }
    else if (id) target = [...scope.querySelectorAll('[id]')].find((node) => node.id === id);
    else if (attribute) target = [...scope.querySelectorAll(`[${attribute}]`)].find((node) => node.getAttribute(attribute) === attributeValue);
    else if (isThreadOpen) target = scope.querySelector('.thread-open');
    else if (isCarry) target = scope.querySelector('input[type="checkbox"]');
    return target && !target.disabled && !target.hidden ? target : fallback;
  };
}
function renderDesk() {
  const active = document.activeElement;
  const restoreFocus = captureDeskFocus(active);
  const restoreReturnFocus = captureDeskFocus(modalReturnFocus);
  document.documentElement.dataset.theme = desk.preferences.theme;
  $('theme-select').value = desk.preferences.theme;
  $('station-summary').textContent = desk.station.handle ? `@${desk.station.handle}${desk.station.postmark ? ` · ${desk.station.postmark}` : ''}` : 'Set your handle & postmark';
  const index = currentIndex();
  const threads = index.threads;
  const chosen = threads.filter((t) => index.carried.has(t.id));
  $('carry-count').textContent = `${chosen.length} ${chosen.length === 1 ? 'thread' : 'threads'} to carry`;
  $('pack-button').disabled = !threads.length || bootFailure;
  $('write-button').disabled = bootFailure;
  updatePrivateSummary();
  const query = $('search').value.trim().toLocaleLowerCase();
  const view = $('view-filter').value;
  const factsById = new Map(threads.map((thread) => [thread.id, threadFacts(desk, thread, index)]));
  const filtered = threads.filter((t) => matchesView(t, factsById.get(t.id), view) && (!query || index.searchTextByThread.get(t.id).some((text) => text.includes(query)))).reverse();
  if (selectedThread && !index.threadById.has(selectedThread)) {
    selectedThread = index.messageToThread.get(readerAnchor)?.id || null;
    revealThread = selectedThread;
  }
  if (!selectedThread && filtered.length) {
    const visible = new Set(filtered.map((thread) => thread.id));
    const lastVisited = [...desk.local.readingPositions].reverse()
      .map((id) => index.messageToThread.get(id)).find((thread) => thread && visible.has(thread.id));
    selectedThread = lastVisited?.id || filtered[0].id;
    revealThread = selectedThread;
  }
  $('board').replaceChildren();
  if (!threads.length) {
    $('board').append(el('div', { class: 'empty-state' }, el('span', { class: 'eyebrow' }, 'INCOMING / OUTGOING'), el('h2', {}, 'Room for a good conversation.'), el('p', {}, 'Your first postcard belongs here. Write a question, share a find, or open a bag someone carried to you.'), el('span', { class: 'empty-rule', 'aria-hidden': true })));
  } else if (!filtered.length) {
    $('board').append(el('div', { class: 'empty-state' }, el('h2', {}, 'No matching threads'), hint(view === 'replies' ? 'Unread replies to conversations you wrote in or chose to follow appear here.' : 'Try another view, or clear the search to see more of your mail.'), button('Show all mail', () => { $('search').value = ''; $('view-filter').value = 'all'; selectedThread = null; resetReader(); resetBoardPage = true; renderDesk(); }, 'quiet')));
  } else {
    if (!boardView) boardView = createPagedList({ id: 'board', label: 'Threads', renderItem: (thread) => {
      const liveIndex = currentIndex();
      const facts = threadFacts(desk, thread, liveIndex);
      const check = el('input', { type: 'checkbox', checked: liveIndex.carried.has(thread.id), 'aria-label': `Carry thread: ${threadTitle(thread)}`, onchange: () => setCarried(thread.id, check.checked) });
      return el('article', { class: `thread-card${thread.id === selectedThread ? ' active' : ''}${facts.unreadCount ? ' is-unread' : ''}${facts.isArchived ? ' is-archived' : ''}`, 'data-thread-id': thread.id },
        el('button', { type: 'button', class: 'thread-open', 'aria-current': thread.id === selectedThread ? 'true' : null, onclick: () => openThread(thread.id, { resume: true }) },
          el('span', { class: 'thread-meta' }, thread.root ? `@${thread.root.handle}` : 'PARENT NOT HERE YET', el('span', {}, `${thread.messages.length} ${thread.messages.length === 1 ? 'postcard' : 'postcards'}`)),
          el('strong', { class: 'thread-subject' }, threadTitle(thread)),
          el('span', { class: 'thread-snippet' }, thread.root ? short(thread.messages.at(-1).body, 110) : 'Kept safe until its parent arrives.'),
          el('span', { class: 'thread-badges' }, facts.unreadCount ? el('span', { class: 'unread-badge' }, `${facts.unreadCount} unread`) : null, facts.hasNewReplies ? badge('New replies') : null, facts.isBookmarked ? badge('Bookmarked') : null, facts.isArchived ? badge('Archived') : null)),
        el('label', { class: 'carry-check' }, check, el('span', {}, 'Carry this thread')));
    } }, pagingAPI);
    boardView.setItems(filtered, { reset: resetBoardPage, revealKey: revealThread });
    $('board').append(boardView.node);
  }
  resetBoardPage = false;
  revealThread = null;
  renderReader(index.threadById.get(selectedThread));
  if (restoreReturnFocus && !modalReturnFocus?.isConnected) modalReturnFocus = restoreReturnFocus();
  if (restoreFocus && document.activeElement !== active) {
    const target = active.isConnected && !active.disabled ? active : restoreFocus();
    target?.focus({ preventScroll: true });
  }
}
async function setCarried(id, checked) {
  await commit((d) => ({ ...d, selected: checked ? [...new Set([...d.selected, id])] : d.selected.filter((key) => key !== id) }));
}

function renderReader(thread) {
  const position = thread ? readingFacts(desk, thread, currentIndex()) : null;
  if (!thread?.messages.some((message) => message.id === readerAnchor)) {
    readerAnchor = position?.resumeId || position?.firstUnreadId || thread?.messages[0]?.id || null;
  }
  parentReturns = parentReturns.filter((id) => currentIndex().messageToThread.get(id)?.id === thread?.id);
  const returnToId = parentReturns.at(-1) || null;
  // A search or board-page change must not rebuild an unchanged open thread.
  if (readerSnapshot === desk && readerThread === (thread?.id || null) && renderedAnchor === readerAnchor && renderedReturn === returnToId) return;
  readerSnapshot = desk;
  readerThread = thread?.id || null;
  renderedAnchor = readerAnchor;
  renderedReturn = returnToId;
  readerView = null;
  $('reader').replaceChildren();
  if (!thread) {
    $('reader').append(el('div', { class: 'desk-empty-card' }, el('span', { class: 'eyebrow' }, 'THE SLOW WAY ROUND'), el('div', { class: 'empty-postage', 'aria-hidden': true }, el('span', {}, 'SSC'), el('span', {}, 'BY HAND')), el('h2', {}, 'A little further,\none pocket at a time.'), el('p', {}, 'Ask in Cumberland. Hear back from somewhere unexpected.'), el('div', { class: 'address-lines', 'aria-hidden': true }, el('i'), el('i'), el('i')), el('p', { class: 'desk-empty-foot' }, 'No account. No central server. Just people carrying files.')));
    return;
  }
  $('reader').append(el('div', { class: 'thread-heading' }, el('div', {}, el('span', { class: 'eyebrow' }, 'ON THE READING DESK'), el('h2', { tabindex: '-1' }, thread.root ? short(thread.root.body, 92) : 'A reply arrived ahead of its postcard')), badge(`${thread.messages.length} ${thread.messages.length === 1 ? 'postcard' : 'postcards'}`)));
  const facts = threadFacts(desk, thread, currentIndex());
  $('reader').append(el('div', { class: 'thread-tools', role: 'group', 'aria-label': 'Thread actions' },
    button(facts.unreadCount ? 'Mark all as read' : 'Mark all as unread', () => markRead(thread.messages.map((message) => message.id), Boolean(facts.unreadCount)), 'quiet', { 'data-thread-action': 'read', title: 'Applies to every postcard in this thread, including other sections' }),
    button(facts.isBookmarked ? 'Remove bookmark' : 'Bookmark thread', () => changeThreadFlag(thread.id, 'bookmarked', !facts.isBookmarked), 'quiet', { 'aria-pressed': String(facts.isBookmarked), 'data-thread-action': 'bookmarked' }),
    button(facts.isFollowed ? 'Stop following' : 'Follow replies', () => changeThreadFlag(thread.id, 'followed', !facts.isFollowed), 'quiet', { 'aria-pressed': String(facts.isFollowed), 'data-thread-action': 'followed', title: 'Show unread replies in the New replies view' }),
    button(facts.isArchived ? 'Return to desk' : 'Archive thread', () => changeThreadFlag(thread.id, 'archived', !facts.isArchived), 'quiet', { 'data-thread-action': 'archived' }),
    button('Print keepsake', () => showPrintKeepsake(desk, thread, experienceAPI()), 'quiet', { 'data-thread-action': 'print' })));
  if (thread.missingParentId) $('reader').append(el('div', { class: 'waiting-note', role: 'status' }, 'Waiting for the earlier postcard. These replies are saved and will reconnect automatically when it arrives.'));
  readerView = createThreadReader({ desk, thread, anchorId: readerAnchor,
    firstUnreadId: position.firstUnreadId, resumeId: position.resumeId, returnToId },
  { el, button, hint, renderPostcard, onNavigate: navigateReader });
  $('reader').append(readerView.node);
}
function renderPostcard(message, source, { practice = false, highlightMarks = new Set(), flipScope = '', onParent = null } = {}) {
  const sourceIndex = source === desk ? currentIndex() : null;
  const routes = sourceIndex ? sourceIndex.routesByMessage.get(message.id) || [] : source.routes.filter((r) => r.messageId === message.id);
  const key = `${practice ? 'practice:' : flipScope ? `${flipScope}:` : ''}${message.id}`;
  const card = el('article', { class: `postcard${flipped.has(key) ? ' is-back' : ''}`, 'data-message-id': message.id });
  const repaint = () => { const next = renderPostcard(message, source, { practice, highlightMarks, flipScope, onParent }); card.replaceWith(next); next.querySelector('[data-flip]')?.focus(); };
  card.append(el('div', { class: 'postcard-header' }, el('div', {}, el('span', { class: 'eyebrow' }, message.parentId ? 'REPLY POSTCARD' : 'PUBLIC POSTCARD'), el('strong', { class: 'postcard-author' }, `@${message.handle}`)), el('time', { datetime: message.createdAt, title: 'Time reported by the writer’s station' }, date(message.createdAt))));
  if (flipped.has(key)) {
    card.append(el('div', { class: 'postcard-back' }, el('h3', {}, 'Where this postcard has been'), hint('Each path is a known copy. Handoffs stay in the recorded order, even when station clocks disagree. Handles and postmarks are supplied by participants.'), ...routes.map((route, i) => renderRoute(route, i, routes.length, { highlightMarks }))));
  } else {
    if (message.parentId) {
      const parent = sourceIndex ? sourceIndex.messagesById.get(message.parentId) : source.messages.find((m) => m.id === message.parentId);
      card.append(parent && onParent
        ? el('div', { class: 'reply-context' }, button(`In reply to @${parent.handle} · View postcard`, onParent, 'quiet', { class: 'button quiet parent-link', 'data-parent-id': parent.id }), el('p', { class: 'parent-excerpt' }, short(parent.body, 100)))
        : el('p', { class: 'reply-label' }, parent ? `In reply to @${parent.handle}` : 'The earlier postcard has not arrived yet'));
    }
    card.append(el('div', { class: 'postcard-body' }, message.body));
    if (!message.parentId) card.append(el('div', { class: 'card-stamp', 'aria-hidden': true }, 'PASS IT ON'));
  }
  card.append(el('div', { class: 'postcard-actions' }, button(flipped.has(key) ? 'Back to message' : `Turn over · ${routes.length} ${routes.length === 1 ? 'path' : 'paths'}`, () => { flipped.has(key) ? flipped.delete(key) : flipped.add(key); repaint(); }, 'quiet', { 'data-flip': true, 'aria-label': flipped.has(key) ? `Back to message by ${message.handle}` : `Turn over postcard by ${message.handle}: inspect ${routes.length} known paths` }), !practice ? button('Write a reply', () => compose(message.id), 'secondary', { 'data-reply-to': message.id }) : null));
  return card;
}
function renderRoute(route, index, total, { compact = false, highlightMarks = new Set() } = {}) {
  const list = el('ol', { class: compact ? 'manifest-journey' : 'journey' });
  for (const mark of route.path) {
    if (compact) list.append(el('li', {}, el('strong', {}, `@${mark.handle}`), ` · ${mark.postmark || 'No place postmark'} · ${kinds[mark.kind]} · `, el('time', { datetime: mark.at }, date(mark.at))));
    else list.append(el('li', { class: `postmark${highlightMarks.has(mark.id) ? ' is-new' : ''}` }, el('div', { class: 'stamp' }, el('strong', {}, mark.postmark || 'NO PLACE POSTMARK'), el('span', {}, `@${mark.handle}`)), el('div', { class: 'stamp-caption' }, el('strong', {}, kinds[mark.kind]), el('time', { datetime: mark.at }, `${date(mark.at)} · station clock`), highlightMarks.has(mark.id) ? badge('Received in this bag') : null)));
  }
  const arrived = route.path.some((mark) => highlightMarks.has(mark.id));
  return el('section', { class: `route${arrived ? ' is-new' : ''}` }, el('h4', { class: 'route-heading' }, total > 1 ? `Known path ${index + 1} of ${total} · ${route.path.length} marks` : `Known path · ${route.path.length} ${route.path.length === 1 ? 'mark' : 'marks'}`), arrived ? hint('This path includes a receipt from this mailbag opening.') : null, list);
}

function manifest(bag, known = new Set()) {
  const routes = new Map();
  for (const route of bag.routes) {
    if (!routes.has(route.messageId)) routes.set(route.messageId, []);
    routes.get(route.messageId).push(route);
  }
  const view = createPagedList({ id: 'manifest', label: 'Postcards', items: bag.messages, renderItem: (message) => el('article', { class: 'preview-message', 'data-message-id': message.id },
    el('div', { class: 'preview-message-heading' }, el('strong', {}, `@${message.handle}`), badge(known.has(message.id) ? 'Already on this desk' : message.parentId ? 'Reply' : 'Postcard')),
    el('p', { class: 'preview-body' }, message.body),
    ...(routes.get(message.id) || []).map((r, i, all) => renderRoute(r, i, all.length, { compact: true })),
    el('details', { class: 'record-details' }, el('summary', {}, 'Record IDs & reported time'), el('p', {}, `Postcard: ${message.id}`), el('p', {}, `Parent: ${message.parentId || 'None — starts a thread'}`), el('p', {}, `Written: ${message.createdAt}`))
  ) }, pagingAPI);
  return el('div', { class: 'manifest-list' }, bag.messages.length > 12 ? hint('This manifest spans several pages. Review each page to see every message, handle, and volunteered postmark. The JSON record below contains the whole bag.') : null, view.node);
}
function rawManifest(bag, serialized = null) { return el('details', { class: 'record-details' }, el('summary', {}, serialized ? 'View the exact JSON that travels' : 'View the public JSON record'), el('pre', { class: 'json-preview' }, serialized || JSON.stringify(bag, null, 2))); }
function packChooser(initialIds = null) {
  withStation(() => {
    const index = currentIndex();
    const threads = index.threads;
    if (!threads.length) { tell('Write or receive a postcard before packing a mailbag.', 'info'); return; }
    const selection = new Set((Array.isArray(initialIds) ? initialIds : desk.selected).filter((id) => index.threadById.has(id)));
    const facts = new Map(threads.map((thread) => [thread.id, packingFacts(desk, thread, index)]));
    let reviewing = false;
    const selectionCount = el('p', { id: 'packing-selection-count', class: 'hint packing-count', role: 'status' });
    const next = button('Review selected mail', async () => {
      if (reviewing || !selection.size) return;
      const selectedIds = [...selection];
      reviewing = true;
      sync();
      const okay = await commit((d) => ({ ...d, selected: selectedIds }));
      reviewing = false;
      if (okay && list.node.isConnected && $('modal').open) packPreview();
      else if (list.node.isConnected) sync();
    }, 'primary');
    const sync = () => {
      next.disabled = reviewing || !selection.size;
      selectChanged.disabled = reviewing || !threads.some((thread) => facts.get(thread.id).hasChanges);
      clearSelection.disabled = reviewing || !selection.size;
      for (const input of list.node.querySelectorAll('input[data-thread-choice]')) { input.checked = selection.has(input.dataset.threadChoice); input.disabled = reviewing; }
      search.disabled = reviewing;
      const unchanged = [...selection].filter((id) => !facts.get(id).hasChanges).length;
      selectionCount.textContent = `${selection.size} ${selection.size === 1 ? 'thread' : 'threads'} selected${unchanged ? ` · ${unchanged} with the same mail and paths as last packing` : ''}.`;
    };
    const list = createPagedList({ id: 'packing', label: 'Threads', items: threads, emptyText: 'No threads match this search. Selections on other pages are kept.', renderItem: (thread) => {
      const status = facts.get(thread.id);
      const state = !status.hasReceipt ? 'unrecorded' : status.hasChanges ? 'changed' : 'unchanged';
      const description = !status.hasReceipt ? 'No saved packing receipt' : status.hasChanges ? `${status.newMessageCount} new ${status.newMessageCount === 1 ? 'postcard' : 'postcards'} · ${status.newPathCount} new or extended ${status.newPathCount === 1 ? 'path' : 'paths'}` : 'Same mail and paths as last packing';
      const input = el('input', { type: 'checkbox', 'data-thread-choice': thread.id, checked: selection.has(thread.id), disabled: reviewing, onchange: () => { input.checked ? selection.add(thread.id) : selection.delete(thread.id); sync(); } });
      return el('label', { class: 'packing-item', 'data-thread-id': thread.id }, input, el('span', { class: 'packing-copy' },
        el('strong', {}, threadTitle(thread)),
        el('small', {}, `${thread.messages.length} public ${thread.messages.length === 1 ? 'postcard' : 'postcards'} · all known replies and paths${desk.local.archivedThreadIds.includes(thread.id) ? ' · archived' : ''}`),
        el('span', { class: 'packing-status', 'data-packing-state': state }, description),
        status.lastPackedAt ? el('small', {}, `Last recorded packing: ${date(status.lastPackedAt)} · station clock`) : null));
    } }, pagingAPI);
    const search = el('input', { type: 'search', id: 'packing-search', autocomplete: 'off', placeholder: 'Search words or handles', oninput: () => {
      const query = search.value.trim().toLocaleLowerCase();
      list.setItems(threads.filter((thread) => !query || index.searchTextByThread.get(thread.id).some((text) => text.includes(query))), { reset: true });
      sync();
    } });
    const selectChanged = button('Select new or changed threads', () => { if (reviewing) return; selection.clear(); for (const thread of threads) if (facts.get(thread.id).hasChanges) selection.add(thread.id); sync(); }, 'secondary', { id: 'select-changed' });
    const clearSelection = button('Clear selection', () => { if (reviewing) return; selection.clear(); sync(); }, 'quiet', { id: 'clear-packing-selection' });
    openModal('What will you carry?', [
      hint('Choose whole threads. You’ll see every message and postmark before the file is packed.'),
      el('div', { class: 'packing-controls' }, selectChanged, clearSelection),
      hint('Bulk choices include all threads, across every page and search result. Clearing a search keeps your individual selections.'),
      field('Find threads to carry', search), selectionCount, el('div', { class: 'packing-list' }, list.node),
      hint('Changes are compared with the last saved packing receipt for each thread. Packing again adds a new bag and packed stamps. To pass along an unchanged original file, open its receipt in the Outbox.'),
      el('div', { class: 'modal-actions' }, next, button('Open outbox', () => showOutbox(desk, carrierAPI()), 'secondary'), button('Cancel', closeModal, 'quiet'))
    ]);
    sync();
  });
}
function packPreview() {
  try {
    const reviewedDesk = desk;
    const prepared = prepareMailbag(reviewedDesk, reviewedDesk.selected);
    const bag = prepared.bag;
    // Validate the exact bytes before committing a packed stamp. The preview
    // and download use the same text, so whitespace cannot push a valid bag
    // beyond the recipient's import limit.
    const serialized = serializeMailbag(bag);
    const download = button('Download mailbag', async () => {
      if (download.disabled) return;
      download.disabled = true;
      if (!(await commit((current) => {
        if (current !== reviewedDesk) throw new Error('The desk changed after this preview. Choose Change selection and review the mail again before packing.');
        return prepared.desk;
      }))) { download.disabled = false; return; }
      const stillReviewing = download.isConnected && $('modal').open;
      try { downloadText(serialized, bagFilename(bag)); }
      catch (error) {
        if (stillReviewing) showPackingReceipt(desk, bag.id, carrierAPI());
        tell(`The bag was packed and saved in your outbox, but the download could not start: ${error.message} Use Download same bag to try again.`, 'error', () => button('View packing receipt', () => showPackingReceipt(desk, bag.id, carrierAPI()), 'quiet'));
        return;
      }
      if (stillReviewing) closeModal();
      tell(`Mailbag download started · ${bag.messages.length} ${bag.messages.length === 1 ? 'postcard' : 'postcards'}. A packing receipt is saved in your private outbox.`, 'success', () => button('View packing receipt', () => showPackingReceipt(desk, bag.id, carrierAPI()), 'quiet'));
    }, 'primary');
    openModal('Before it leaves your desk', [
      el('div', { class: 'packing-summary' }, badge(`${bag.messages.length} public ${bag.messages.length === 1 ? 'postcard' : 'postcards'}`), badge(`${bag.routes.length} known ${bag.routes.length === 1 ? 'path' : 'paths'}`)),
      el('p', {}, 'These exact messages, handles, and volunteered postmarks will travel. The file also includes random record and station IDs, parent links, and reported times.'),
      hint('Your private drafts, outbox, reading state and saved places, bookmarks, archive, appearance settings, and carry choices stay on this device. A mailbag is public plain text. Anyone holding the file can read or copy it.'),
      manifest(bag), rawManifest(bag, serialized),
      el('div', { class: 'modal-actions sticky-actions' }, download, button('Change selection', packChooser, 'quiet'))
    ], { wide: true });
  } catch (error) { tell(error.message, 'error'); }
}

async function importPreview(raw, filename) {
  await settle();
  try {
    const preview = await previewMailbag(desk, raw);
    const { counts, bag } = preview;
    const accept = button(preview.alreadyOpened ? 'Open again (no changes)' : 'Accept mailbag', () => withStation(async () => {
      if (accept.disabled) return;
      accept.disabled = true;
      try {
        // Parsing and fingerprint checks can await. Keep the entire acceptance
        // inside the write queue so it cannot replace a newer local visit.
        if (!(await commit(async (current) => (await acceptMailbag(current, bag)).desk, { render: false }))) { accept.disabled = false; return; }
        const stillReviewing = accept.isConnected && $('modal').open;
        if (stillReviewing) {
          const incoming = groupThreads(desk).find((t) => t.messages.some((m) => preview.newMessages.some((n) => n.id === m.id)));
          if (incoming) { selectedThread = incoming.id; resetReader(); }
          closeModal();
        }
        renderDesk();
        tell(preview.alreadyOpened ? 'You’ve already opened this bag. No duplicate postcards or postmarks were added.' : `Bag opened. ${counts.newPosts} new ${counts.newPosts === 1 ? 'post' : 'posts'}, ${counts.newReplies} new ${counts.newReplies === 1 ? 'reply' : 'replies'}. Turn a postcard over to follow its journey.`, 'success', !preview.alreadyOpened && !stillReviewing ? () => button('Read arriving mail', () => showMailCall(desk, bag.id, experienceAPI()), 'quiet') : null);
        if (!preview.alreadyOpened && stillReviewing) showMailCall(desk, bag.id, experienceAPI());
        requestPersistence().catch(() => {});
      } catch (error) { accept.disabled = false; importError(error); }
    }), 'primary');
    openModal('A mailbag has arrived', [
      el('p', { class: 'bag-filename' }, filename),
      el('div', { class: 'summary-grid' }, ...[[counts.newPosts, 'new posts'], [counts.newReplies, 'new replies'], [counts.seenMessages, 'already seen'], [counts.newPaths, 'new paths']].map(([n, label]) => el('div', { class: 'mini-stat' }, el('strong', {}, n), el('span', {}, label)))),
      preview.alreadyOpened ? el('div', { class: 'waiting-note' }, 'This exact bag has already been opened here. Opening it again will change nothing.') : hint('Nothing is added until you accept. Accepting stamps each arriving copy with your current handle and optional postmark.'),
      hint('Participants supply these handles, postmarks, and times. They are not proof of identity or verified travel.'),
      manifest(bag, new Set(desk.messages.map((m) => m.id))), rawManifest(bag),
      el('div', { class: 'modal-actions sticky-actions' }, accept, button('Leave unopened', closeModal, 'quiet'))
    ], { wide: true });
  } catch (error) { importError(error); }
}
function importError(error) {
  openModal('This bag could not be opened', [el('div', { class: 'notice error', role: 'alert' }, error.message), el('p', {}, 'Your existing desk has not changed. Ask the carrier for another copy, or check that this is a Sneakernet Social Club mailbag.'), el('div', { class: 'modal-actions' }, button('Back to the desk', closeModal, 'primary'))]);
}
async function readFile(input, action) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const token = ++fileReadSerial;
  try {
    const limit = input.id === 'backup-file' ? (LIMITS.backupBytes || 20 * 1024 * 1024) : LIMITS.fileBytes;
    if (file.size > limit) throw new Error(`This file is too large. The limit is ${Math.round(limit / 1024 / 1024)} MB.`);
    const text = await file.text();
    if (token !== fileReadSerial) return;
    await action(text, file.name);
  } catch (error) { importError(error); }
}

async function backupPreview(raw, filename) {
  try {
    const restored = parseBackup(raw);
    const confirm = el('input', { id: 'restore-confirm', type: 'checkbox' });
    const restore = button('Restore this desk', async () => {
      if (!confirm.checked) return;
      restore.disabled = true;
      await settle();
      try {
        const okay = await replaceDeskSnapshot(restored);
        if (okay) { draftEdits.clear(); selectedThread = null; resetReader(); resetBoardPage = true; flipped.clear(); $('view-filter').value = 'inbox'; $('search').value = ''; closeModal(); renderDesk(); tell('Desk restored, including private drafts, outbox, reading state and places, bookmarks, archive, station, carry choices, and received-mail history.'); }
        else restore.disabled = false;
      } catch (error) { tell(error.message, 'error'); restore.disabled = false; }
    }, 'primary');
    restore.disabled = true;
    confirm.addEventListener('change', () => { restore.disabled = !confirm.checked; });
    openModal('Restore a full desk', [
      el('p', { class: 'bag-filename' }, filename),
      el('p', {}, `This backup holds ${restored.messages.length} postcards for @${restored.station.handle || 'an unnamed station'}. It includes private drafts and settings.`),
      el('div', { class: 'notice' }, 'Restore replaces this desk. It is separate from accepting public mail. Back up your current desk first if you want to keep both.'),
      button('Back up current desk first', exportBackup, 'secondary'),
      el('label', { class: 'packing-item' }, confirm, el('span', {}, 'Replace the current desk with this backup')),
      el('div', { class: 'modal-actions' }, restore, button('Cancel', closeModal, 'quiet'))
    ]);
  } catch (error) {
    openModal('This backup could not be restored', [el('div', { class: 'notice error', role: 'alert' }, error.message), el('p', {}, 'The current desk has not changed. Choose a full-desk backup, not a public mailbag.'), button('Back to the desk', closeModal, 'primary')]);
  }
}

function toolsPanel() {
  const drafts = currentDrafts();
  const savedDrafts = (drafts.post ? 1 : 0) + Object.values(drafts.replies).filter(Boolean).length;
  openModal('Desk tools', [
    el('section', { class: 'tool-section' }, el('h3', {}, 'Keep a copy of the whole desk'), el('p', {}, bootFailure ? 'The stored desk has not been opened. No original data has been replaced. Download a recovery copy if the record is readable, or restore a known backup.' : `Your desk has ${desk.messages.length} postcards, ${savedDrafts} private ${savedDrafts === 1 ? 'draft' : 'drafts'}, and ${desk.local.outbox.length} packing receipts. A backup includes all mail, paths, outbox, drafts, reading state and saved places, bookmarks, archive, station details, and preferences.`), hint(desk.local.lastBackupAt ? `Last backup download started ${date(desk.local.lastBackupAt)}. The browser cannot confirm whether you kept the file.` : 'No backup download has been started from this desk yet.'), el('div', { class: 'modal-actions' }, button(bootFailure ? 'Download recovery copy' : 'Back up full desk', exportBackup, 'primary'), button('Restore full desk', () => $('backup-file').click(), 'secondary'))),
    bootFailure ? null : capacityPanel(),
    el('section', { class: 'tool-section' }, el('h3', {}, 'Your station'), el('p', {}, desk.station.handle ? `@${desk.station.handle} · ${desk.station.postmark || 'No place postmark'}` : 'Your handle and optional postmark are not set yet.'), button('Edit station', () => stationEditor(), 'secondary')),
    el('section', { class: 'tool-section help-copy' }, el('h3', {}, 'Take the desk offline'), el('p', {}, offlineReady ? 'This installation is ready to reopen offline. Keep this address bookmarked; reopen it in this same browser and profile.' : 'Open this app from HTTPS or a localhost server and wait for “Offline ready.” Then bookmark this address and reopen it in the same browser and profile.'), el('p', {}, 'Your mail stays in this browser’s storage, separate from the application files. A new browser, device, or site address gets its own desk. Clearing site data removes the desk and its offline copy; keep a full-desk backup.'), el('p', {}, 'To exchange mail: choose threads, pack a JSON mailbag, transfer the downloaded file, then use Open a mailbag on the other desk. A mailbag is not a full-desk backup.')),
    el('details', { class: 'tool-section' }, el('summary', {}, 'Club notes & keyboard help'), el('div', { class: 'help-copy' }, el('p', {}, 'Postcards are plain public text. Handles and postmarks are self-reported, and files are not encrypted or digitally signed. The app never asks for GPS or adds coordinates.'), el('p', {}, 'Use Tab to move between controls, Space to toggle carry selections, and Enter to activate buttons. Escape closes a dialog and keeps private drafts. Ctrl / ⌘ + Enter posts from the writing form.'), el('p', {}, 'A reply that arrives early stays on the desk until its parent arrives. Opening the same bag again adds no duplicate messages or marks. Separate paths remain separate, and recorded handoff order takes precedence over station clocks.'))),
    el('details', { class: 'tool-section' }, el('summary', {}, 'Start a fresh desk'), el('p', {}, 'Make a new, empty station on this device. This replaces the current desk; save a backup first if you want to return to it.'), button('Make a fresh desk…', freshDeskPrompt, 'danger')),
    el('p', { class: 'hint version-note' }, `Sneakernet Social Club v${VERSION} · Green Shoe Garage Field Instrument`)
  ], { wide: false });
}

function capacityPanel() {
  // Compute bytes only when Desk tools opens, never during typing or search.
  const usage = deskCapacity(desk);
  const counts = new Intl.NumberFormat();
  const rows = [
    ['messages', 'Public postcards', LIMITS.messages],
    ['routes', 'Known copy paths', LIMITS.routes],
    ['totalSteps', 'Postmarks across all paths', LIMITS.totalSteps],
    ['longestPath', 'Marks in the longest path', LIMITS.stepsPerRoute],
    ['receivedBags', 'Opened-bag records', LIMITS.receipts],
    ['backupBytes', 'Full-backup allowance', LIMITS.backupBytes],
  ];
  const near = rows.some(([key, , limit]) => usage[key] >= limit * .8);
  return el('details', { class: 'tool-section capacity-panel', id: 'desk-capacity', open: near },
    el('summary', {}, 'Desk capacity', near ? badge('Approaching a limit') : null),
    hint('Counts for the saved desk. These are this app’s supported limits, not a measurement of free space on your device.'),
    el('dl', { class: 'capacity-list' }, ...rows.map(([key, label, limit]) => {
      const used = usage[key];
      const formatted = key === 'backupBytes' ? `${(used / 1024 / 1024).toFixed(2)} MiB of ${limit / 1024 / 1024} MiB` : `${counts.format(used)} of ${counts.format(limit)}`;
      return el('div', { class: 'capacity-row', 'data-capacity-key': key, 'data-used': used, 'data-limit': limit },
        el('dt', { id: `capacity-${key}-label` }, label),
        el('dd', {}, formatted, used >= limit ? badge('At limit') : used >= limit * .8 ? badge('Near limit') : null),
        el('meter', { min: 0, max: limit, value: used, 'aria-labelledby': `capacity-${key}-label`, title: `${counts.format(used)} of ${counts.format(limit)}${key === 'backupBytes' ? ' bytes, including reserved backup timestamps' : ''}` }));
    })),
    el('p', {}, 'Shared portions of separate paths count in each path. The backup allowance includes room for backup timestamps; the next saved file can be a few bytes smaller. Private drafts and preferences belong only in a full backup.'),
    el('p', {}, 'Archiving keeps mail and does not free capacity. Near a limit, keep a full backup and use a separate empty desk for additional mail. Pack fewer threads if a bag exceeds its 5 MiB limit.'),
    hint(`Recent arrivals and the Outbox each keep up to ${LIMITS.arrivals} summaries, within their reference limits. Older summaries can age out; postcards, their paths, and opened-bag records are retained.`));
}
function freshDeskPrompt() {
  const phrase = el('input', { id: 'fresh-confirm', autocomplete: 'off', placeholder: 'NEW DESK' });
  const reset = button('Start empty', async () => {
    if (phrase.value !== 'NEW DESK') return;
    reset.disabled = true;
    await settle();
    if (await replaceDeskSnapshot(newDesk())) { selectedThread = null; resetReader(); resetBoardPage = true; flipped.clear(); $('view-filter').value = 'inbox'; $('search').value = ''; closeModal(); renderDesk(); tell('A fresh, empty desk is ready.'); }
    else reset.disabled = false;
  }, 'danger');
  reset.disabled = true;
  phrase.addEventListener('input', () => { reset.disabled = phrase.value !== 'NEW DESK'; });
  openModal('Start a fresh desk?', [el('p', {}, 'This replaces all current mail, paths, drafts, and station details on this installation. Your downloaded files are unaffected.'), button('Back up full desk first', exportBackup, 'secondary'), field('Type NEW DESK to continue', phrase), el('div', { class: 'modal-actions' }, reset, button('Cancel', closeModal, 'quiet'))]);
}

async function practiceDelivery() {
  const station = (handle, postmark) => { const d = newDesk(); d.station.handle = handle; d.station.postmark = postmark; return d; };
  let a = station('cumberland-demo', 'Cumberland Maker Meetup');
  let b = station('morgan-demo', 'On the road');
  let c = station('defcon-demo', 'DEF CON');
  const created = createMessage(a, { body: 'Who’s got a spare rotary encoder?' });
  a = created.desk;
  const outbound = prepareMailbag(a, [created.message.id]);
  a = outbound.desk;
  b = (await acceptMailbag(b, outbound.bag)).desk;
  const onward = prepareMailbag(b, [created.message.id]);
  b = onward.desk;
  c = (await acceptMailbag(c, onward.bag)).desk;
  const reply = createMessage(c, { body: 'I’ve got two in my parts bin. One has your name on it. Sending this back from DEF CON!', parentId: created.message.id });
  c = reply.desk;
  const homeward = prepareMailbag(c, [created.message.id]);
  b = (await acceptMailbag(b, homeward.bag)).desk;
  const returning = prepareMailbag(b, [created.message.id]);
  a = (await acceptMailbag(a, returning.bag)).desk;
  let stage = 0;
  const steps = [
    { title: '01 / A question in Cumberland', copy: 'A postcard is written at the meetup. A maker offers to carry the thread.', source: created.desk, action: 'Send with a maker' },
    { title: '02 / A pocket takes it further', copy: 'Morgan opens the bag, then carries the same postcard to DEF CON. Nobody needs to be online together.', source: onward.desk, action: 'Open at DEF CON' },
    { title: '03 / A reply joins the bag', copy: 'Someone at DEF CON has a spare encoder. Their reply points to the original postcard, ready for the trip home.', source: c, action: 'Bring the reply home' },
    { title: '04 / Back at the mail desk', copy: 'Days later, a bag comes home with a conversation inside. Turn either postcard over to read its own recorded journey.', source: a, action: 'Return to my empty practice-free desk' }
  ];
  const show = () => {
    const step = steps[stage];
    openModal('Try a delivery', [el('div', { class: 'demo-banner' }, 'PRACTICE DESK · This example never mixes with your mail.'), el('span', { class: 'eyebrow' }, step.title), el('p', {}, step.copy), el('div', { class: 'message-list' }, ...step.source.messages.map((m) => renderPostcard(m, step.source, { practice: true }))), el('div', { class: 'modal-actions' }, button(stage === 3 ? 'Return to my desk' : step.action, () => { if (stage === 3) closeModal(); else { stage++; show(); } }, 'primary'), stage ? button('Previous stop', () => { stage--; show(); }, 'quiet') : null)], { wide: true });
  };
  show();
}

async function setupOffline() {
  const update = () => { $('offline-status').textContent = offlineReady ? (navigator.onLine ? 'Offline ready' : 'Offline · ready') : 'Offline setup pending'; $('offline-status').dataset.ready = String(offlineReady); };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offline-status').textContent = 'Use HTTPS or localhost for offline setup'; return; }
  const scriptURL = new URL('../sw.js', import.meta.url);
  const check = async () => {
    const controller = navigator.serviceWorker.controller;
    // A worker for a parent folder must not certify a separate installation.
    if (!controller || controller.scriptURL !== scriptURL.href) return false;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 8000);
      channel.port1.onmessage = ({ data }) => {
        if (data?.type !== 'OFFLINE_READY') return;
        clearTimeout(timeout);
        offlineReady = Boolean(data.ready);
        update();
        channel.port1.close();
        resolve(offlineReady);
      };
      try { controller.postMessage({ type: 'CHECK_OFFLINE_READY' }, [channel.port2]); }
      catch { clearTimeout(timeout); channel.port1.close(); resolve(false); }
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange', check);
  // A known cached installation remains ready even if registering an update
  // cannot reach the host while disconnected.
  if (navigator.serviceWorker.controller) await check();
  try {
    await navigator.serviceWorker.register(scriptURL, { scope: new URL('../', import.meta.url).pathname });
    let timeout;
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Offline setup timed out')), 12000); })]).finally(() => clearTimeout(timeout));
    await check();
  } catch { if (!offlineReady) $('offline-status').textContent = 'Offline setup failed · reopen while connected'; }
}

async function boot() {
  const startupControls = ['write-button', 'open-button', 'pack-button', 'tools-button', 'station-button', 'try-button', 'theme-select', 'arrivals-button', 'album-button', 'drafts-button', 'outbox-button', 'view-filter'];
  for (const id of startupControls) $(id).disabled = true;
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('close', () => {
    flushDrafts();
    if ($('modal').open) return;
    if (restoreModalFocus) (modalReturnFocus?.isConnected && !modalReturnFocus.disabled ? modalReturnFocus : $('write-button').disabled ? $('tools-button') : $('write-button')).focus();
    restoreModalFocus = true;
  });
  $('write-button').addEventListener('click', () => compose());
  $('open-button').addEventListener('click', () => $('mailbag-file').click());
  $('mailbag-file').addEventListener('change', () => readFile($('mailbag-file'), importPreview));
  $('backup-file').addEventListener('change', () => readFile($('backup-file'), backupPreview));
  $('pack-button').addEventListener('click', packChooser);
  $('tools-button').addEventListener('click', toolsPanel);
  $('arrivals-button').addEventListener('click', () => showArrivalHistory(desk, experienceAPI()));
  $('album-button').addEventListener('click', () => showPostmarkAlbum(desk, experienceAPI()));
  $('drafts-button').addEventListener('click', draftsPanel);
  $('outbox-button').addEventListener('click', () => showOutbox(desk, carrierAPI()));
  $('station-button').addEventListener('click', () => stationEditor());
  $('try-button').addEventListener('click', () => practiceDelivery().catch((error) => tell(error.message, 'error')));
  $('search').addEventListener('input', () => { resetBoardPage = true; renderDesk(); });
  $('view-filter').addEventListener('change', () => { selectedThread = null; resetReader(); resetBoardPage = true; renderDesk(); });
  $('theme-select').addEventListener('change', () => { const theme = $('theme-select').value; document.documentElement.dataset.theme = theme; commit((d) => ({ ...d, preferences: { ...d.preferences, theme } }), { render: false }); });
  window.addEventListener('beforeunload', (event) => { if (queuedWrites || draftEdits.size || saveFailure) { flushDrafts(); event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', flushDrafts);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDrafts(); });
  try {
    const saved = await loadDesk();
    revision = saved.revision;
    if (saved.desk) {
      unreadableDesk = saved.desk;
      desk = validateDesk(saved.desk);
      // Complete the atomic schema upgrade before any small draft patch can
      // run. A failed upgrade leaves the original persisted desk untouched.
      if (saved.desk.schemaVersion !== desk.schemaVersion) { const result = await saveDesk(desk, revision); revision = result.revision; }
      unreadableDesk = null;
    }
    else { const result = await saveDesk(desk, revision); revision = result.revision; }
  } catch (error) {
    bootFailure = true;
    saveFailure = error.message;
    tell(`The saved desk could not be read: ${error.message} Use Desk tools to restore a backup. No saved data has been replaced.`, 'error');
  }
  for (const id of startupControls) $(id).disabled = false;
  renderDesk();
  saveStatus();
  subscribeChanges((change) => {
    const otherRevision = typeof change === 'number' ? change : change?.revision;
    if (otherRevision != null && otherRevision <= revision) return;
    externalChange = true;
    saveFailure = 'Another tab has saved this desk.';
    saveStatus();
    tell('Another tab saved this desk. Back up this tab if it contains work you need, then reload to open the saved version.', 'error', () => button('Back up this tab', exportBackup, 'quiet'));
  });
  setupOffline();
  document.documentElement.dataset.appReady = 'true';
}
boot().catch((error) => { tell(`The desk could not start: ${error.message}. Reload, or restore a full-desk backup.`, 'error'); });
