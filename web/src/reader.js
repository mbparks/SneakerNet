// Reading state and persistence belong to the desk model/root controller.
// This view holds only one bounded section and an optional return-to-reply link.
import { PAGE_SIZE, pageWindow } from './desk-view.js';

export function readingWindow(thread, anchorId = null, pageSize = PAGE_SIZE) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
  const found = thread.messages.findIndex((message) => message.id === anchorId);
  const index = Math.max(0, found);
  const window = pageWindow(thread.messages, Math.floor(index / size), size);
  return { page: window.page, pages: window.pages, start: window.start, end: window.end,
    anchorId: thread.messages[index]?.id || null,
    messages: window.items, messageIds: window.items.map((message) => message.id) };
}

/**
 * Construction is read-only. Navigation delegates one complete exposed section
 * to api.onNavigate; the controller decides whether/how to save and replace it.
 * A true result means navigation was handled, not proof that storage succeeded.
 */
export function createThreadReader({ desk, thread, anchorId = null, firstUnreadId = null,
  resumeId = null, returnToId = null }, api) {
  const { el, button, hint, renderPostcard, onNavigate } = api;
  const window = readingWindow(thread, anchorId);
  const present = new Set(thread.messages.map((message) => message.id));
  const controls = [];
  let busy = false;
  const status = el('p', { id: 'reader-page-status', class: 'page-status reader-page-status', role: 'status', tabindex: '-1' },
    thread.messages.length ? `Postcards ${window.start + 1}–${window.end} of ${thread.messages.length}` : 'No postcards in this thread.');
  const feedback = el('p', { class: 'reader-navigation-status hint', role: 'status' });
  const node = el('div', { class: 'thread-reader', 'data-thread-id': thread.id,
    'data-anchor-id': window.anchorId || '', 'aria-busy': 'false' });

  function sync() {
    node.setAttribute('aria-busy', String(busy));
    for (const { control, unavailable } of controls) control.disabled = busy || unavailable();
  }

  async function navigate(targetId, reason, nextReturnId = returnToId) {
    if (busy || !present.has(targetId)) return false;
    const target = readingWindow(thread, targetId);
    busy = true;
    feedback.textContent = 'Opening section…';
    feedback.setAttribute('role', 'status');
    sync();
    try {
      const handled = await onNavigate({ threadId: thread.id, anchorId: target.anchorId,
        messageIds: [...target.messageIds], returnToId: present.has(nextReturnId) ? nextReturnId : null, reason });
      if (handled !== true) {
        feedback.textContent = 'That section could not be opened. You can keep reading here.';
        feedback.setAttribute('role', 'alert');
        return false;
      }
      feedback.textContent = '';
      return true;
    } catch (error) {
      feedback.textContent = `That section could not be opened: ${error?.message || 'Please try again.'}`;
      feedback.setAttribute('role', 'alert');
      return false;
    } finally {
      busy = false;
      sync();
    }
  }

  function navigationButton(label, id, target, reason, unavailable, nextReturn = () => returnToId) {
    const control = button(label, () => navigate(target(), reason, nextReturn()), 'quiet', { id });
    controls.push({ control, unavailable });
    return control;
  }

  const unread = navigationButton('First unread', 'reader-first-unread', () => firstUnreadId,
    'first-unread', () => !present.has(firstUnreadId), () => null);
  const back = navigationButton('Return to reply', 'reader-return', () => returnToId,
    'return', () => !present.has(returnToId), () => null);
  back.hidden = !present.has(returnToId);
  const previous = navigationButton('Previous postcards', 'reader-previous', () => thread.messages[Math.max(0, window.start - PAGE_SIZE)]?.id,
    'previous', () => window.page === 0);
  const next = navigationButton('Next postcards', 'reader-next', () => thread.messages[window.end]?.id,
    'next', () => window.page >= window.pages - 1);
  const jumps = el('nav', { class: 'reader-jumps thread-tools', 'aria-label': 'Reading shortcuts' }, unread, back);
  const list = el('div', { class: 'message-list' });
  for (const message of window.messages) {
    const onParent = message.parentId && present.has(message.parentId)
      ? () => navigate(message.parentId, 'parent', message.id) : null;
    const card = renderPostcard(message, desk, { onParent });
    card.setAttribute('tabindex', '-1');
    list.append(card);
  }
  const pages = el('nav', { class: 'page-actions reader-page-actions', 'aria-label': 'Conversation sections' }, previous, next);
  pages.hidden = window.pages === 1;
  node.append(status, jumps,
    hint('Only the section you open is marked read. Threads reopen at their saved postcard; reading places stay on this desk and in full backups.'),
    list, pages, feedback);
  sync();

  return { node, page: window.page, anchorId: window.anchorId, messageIds: [...window.messageIds],
    focusAnchor() {
      // Turning over a postcard replaces its element. Resolve the live card,
      // not the detached element that was first rendered in this section.
      const target = window.anchorId ? node.querySelector(`[data-message-id="${window.anchorId}"]`) || status : status;
      target.setAttribute('tabindex', '-1');
      target.focus();
    } };
}
