/**
 * Reproducible browser acceptance for Sneakernet Social Club.
 *
 * Install the optional test dependency and browser before running:
 *   npm install
 *   npx playwright install chromium
 *   node tests/browser.acceptance.mjs
 *
 * Optional: SSC_BROWSER=webkit (install that Playwright browser first),
 * SSC_HEADED=1, or SSC_QA_OUTPUT=/absolute/output/directory.
 *
 * This suite uses ordinary UI controls, actual file choosers, and actual browser
 * downloads. It never injects application state or reads IndexedDB directly.
 * Browser evaluate calls only inspect DOM geometry, focus, or navigator.onLine.
 * The local HTTP server is shut down before the exchange and every context is
 * switched offline. Screenshots are evidence for subsequent human visual review.
 * Launch failure writes NOT RUN, never a synthetic PASS.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join, extname, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const appVersion = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT = resolve(process.env.SSC_QA_OUTPUT || join(ROOT, 'qa-results', runStamp));
const engine = process.env.SSC_BROWSER || 'chromium';
const headless = process.env.SSC_HEADED !== '1';
const TIMEOUT = 30000;
const question = 'Who’s got a spare rotary encoder?';
const reply = 'I have two in my parts bin. One has your name on it. Sending this home from DEF CON!';
const privateDraft = 'PRIVATE DRAFT — do not put this unfinished thought in a public mailbag.';
const planned = [
  'Cold empty desks and isolated practice delivery',
  'Three independent station identities',
  'Offline reopen with the static server stopped',
  'A writes in Cumberland; draft autosaves privately',
  'A exports a reviewed file; B previews before accepting',
  'B carries the actual exported file to C',
  'C replies; B brings the actual return file to A',
  'A sees one two-message thread and ordered postmarks',
  'Repeated import preserves every message and postmark',
  'An unseen shorter route remains a distinct known path',
  'Two branches return without a fictional combined journey',
  'Reply-first exported file reconnects when its parent arrives',
  'Full-desk backup restores identity, drafts, settings, and receipts',
  'Damaged file preserves the working desk',
  'Desktop day, night, and high-contrast persistence and screenshots',
  'Keyboard Tab, Enter, Escape, and posting shortcut',
  '390px touch layout: import, reply, pack, reopen, all color modes',
  '320px touch layout: write, import, pack, and overflow check',
  'No uncaught application errors',
  'Mail call separates receipt from reading and remembers unread replies',
  'Inbox filters distinguish own, unread, carrying, waiting, and new replies',
  'Bookmarks, following, and archive state stay private and survive reopen',
  'Private drafts shelf resumes and clears post and reply drafts',
  'Backup status and legacy version-1 restore preserve the complete desk',
  'Recent arrival history ignores repeated imports and keeps received summaries',
  'Postmark album groups participant stations while retaining separate paths',
  'Printable keepsake contains only public fronts and distinct postcard backs',
  'Fresh and imported desks have no invented packed-bag history',
  'Packing records a private receipt matching the reviewed public bag',
  'Download same bag preserves exact bytes, outbox, and postcard paths',
  'New replies change packing choices and receipt repacking includes current threads',
  'Outbox receipts restore with current backups and migrate schema-2 desks safely',
  'Larger offline exports preserve all pages of packing choices and the complete manifest',
  'Board pages and search retain hidden carry choices without silently marking mail read',
  'Desk capacity matches the actual full-desk backup and larger restores preserve all mail',
  '320px and 390px touch paths navigate larger desks, packing choices, and capacity',
  'Long conversations use actual offline exports and mark only the explicitly opened page read',
  'First-unread navigation and offline reopen retain a private message-based reading position',
  'Reply-parent navigation crosses reader pages and returns to the originating postcard',
  'Reading positions survive full restore, remain private, and reconnect when an orphan gains its parent',
  'Long-thread reading works through keyboard controls and 320px and 390px touch paths',
];
const results = {
  suite: 'Sneakernet Social Club actual-browser acceptance',
  appVersion, startedAt: new Date().toISOString(), status: 'not-run',
  browser: { engine, headless }, host: { platform: process.platform, node: process.version },
  limitations: [
    'Mobile checks use emulated touch viewports, not physical Android or iOS devices.',
    'Chromium mobile emulation is not evidence of Safari behavior; an optional WebKit run is a separate engine check.',
    'File choosers and downloads are automated browser controls. USB sticks, AirDrop, and operating-system share sheets are not exercised.',
    'Screenshots are captured for human review; an automated overflow check is not a full visual or assistive-technology audit.',
    'Print checks inspect the public keepsake DOM and print controls; no physical printer or system print dialog is exercised.',
  ],
  installations: [], checks: [], artifacts: [], pageErrors: [],
};
const sessions = new Map();
let browser, server, origin;
let phase = 'test dependency';
let anyCheckStarted = false;

function artifact(path, type) {
  const item = { path: relative(OUTPUT, path).split(sep).join('/'), type };
  results.artifacts.push(item); return item.path;
}
function errorText(error) { return error?.stack || String(error); }
async function check(name, task) {
  anyCheckStarted = true;
  const started = performance.now();
  try {
    const details = await task();
    results.checks.push({ name, status: 'pass', elapsedMs: Math.round(performance.now() - started), details: details ?? {} });
    console.log(`PASS ${name}`);
    return details;
  } catch (error) {
    results.checks.push({ name, status: 'fail', elapsedMs: Math.round(performance.now() - started), error: errorText(error) });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}
async function startServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  let requests = 0;
  server = createServer(async (req, res) => {
    requests++;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let filename = resolve(ROOT, `.${pathname}`);
      if (filename !== ROOT && !filename.startsWith(`${ROOT}${sep}`)) { res.writeHead(403).end(); return; }
      if ((await stat(filename)).isDirectory()) filename = join(filename, 'index.html');
      const contents = await readFile(filename);
      res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(contents);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  origin = `http://127.0.0.1:${server.address().port}/`;
  results.server = { origin, stoppedBeforeExchange: false, requestCount: () => requests };
}
async function stopServer({ beforeExchange = false } = {}) {
  if (!server?.listening) return;
  await new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
    server.closeAllConnections?.();
  });
  results.server.requestsBeforeShutdown = results.server.requestCount();
  delete results.server.requestCount;
  results.server.stoppedBeforeExchange = beforeExchange;
}
async function ready(page) {
  await page.locator('html[data-app-ready="true"]').waitFor({ timeout: TIMEOUT });
  await page.locator('#offline-status[data-ready="true"]').waitFor({ timeout: TIMEOUT });
  await saved(page);
}
async function saved(page) {
  await page.locator('#save-status[data-state="saved"]').waitFor({ timeout: TIMEOUT });
}
async function session(name, { mobile = false, width = 1440, height = 1000 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile, hasTouch: mobile, acceptDownloads: true,
    serviceWorkers: 'allow', reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(TIMEOUT);
  const page = await context.newPage();
  context.on('page', p => monitorPage(name, p));
  monitorPage(name, page);
  await page.goto(origin, { waitUntil: 'networkidle' });
  await ready(page);
  const item = { name, context, page, mobile, width, height };
  sessions.set(name, item);
  results.installations.push({ name, storage: 'isolated browser context', width, height, touch: mobile });
  return item;
}
function monitorPage(name, page) {
  page.on('pageerror', error => results.pageErrors.push({ installation: name, message: error.message }));
}
async function press(s, locator) { return s.mobile ? locator.tap() : locator.click(); }
async function closed(page) { await page.locator('#modal').waitFor({ state: 'hidden' }); }
async function closeDialog(s) {
  if (await s.page.locator('#modal').isVisible()) { await press(s, s.page.locator('#modal-close')); await closed(s.page); }
}
async function setStation(s, handle, postmark) {
  await closeDialog(s);
  await press(s, s.page.locator('#station-button'));
  await s.page.getByLabel('Your handle', { exact: true }).fill(handle);
  await s.page.getByLabel('Your postmark (optional)', { exact: true }).fill(postmark);
  await press(s, s.page.getByRole('button', { name: 'Save station', exact: true }));
  await closed(s.page); await saved(s.page);
  assert.ok((await s.page.locator('#station-summary').textContent()).includes(`@${handle}`));
}
async function writePost(s, body, { isReply = false, keepDraft = false } = {}) {
  await closeDialog(s);
  await press(s, isReply ? s.page.locator('#reader .postcard').first().getByRole('button', { name: 'Write a reply', exact: true }) : s.page.locator('#write-button'));
  await s.page.locator('#postcard-message').fill(body);
  await saved(s.page);
  await press(s, s.page.getByRole('button', { name: keepDraft ? 'Keep as draft' : isReply ? 'Post reply' : 'Post postcard', exact: true }));
  await closed(s.page); await saved(s.page);
}
async function saveDownload(s, action, filename, type) {
  const waiting = s.page.waitForEvent('download');
  await action();
  const download = await waiting;
  assert.equal(await download.failure(), null, 'browser reported a failed download');
  const path = join(OUTPUT, 'files', filename);
  await download.saveAs(path);
  artifact(path, type);
  const text = await readFile(path, 'utf8');
  return { path, text, bytes: Buffer.byteLength(text, 'utf8'), data: JSON.parse(text), suggestedName: download.suggestedFilename() };
}
async function backup(s, filename) {
  await closeDialog(s);
  await press(s, s.page.locator('#tools-button'));
  const result = await saveDownload(s, () => press(s, s.page.getByRole('button', { name: 'Back up full desk', exact: true })), filename, 'actual full-desk download');
  await closeDialog(s); await saved(s.page);
  assert.equal(result.data.format, 'sneakernet-social-club/desk');
  assert.ok(result.bytes <= 20 * 1024 * 1024, 'download must fit its own backup import limit');
  return result;
}
// Making a backup records a fresh download-start time. Ignore only that field
// when comparing another operation's effect; every message, mark, receipt,
// draft, preference, and other private flag must still be identical.
function withoutBackupTime(desk) {
  const copy = structuredClone(desk);
  if (copy.local) copy.local.lastBackupAt = null;
  return copy;
}
async function restoreBackup(s, path) {
  await closeDialog(s);
  await press(s, s.page.locator('#tools-button'));
  await choose(s, s.page.getByRole('button', { name: 'Restore full desk', exact: true }), path);
  await s.page.getByRole('heading', { name: 'Restore a full desk', exact: true }).waitFor();
  assert.equal(await s.page.getByRole('button', { name: 'Restore this desk', exact: true }).isEnabled(), false);
  await s.page.getByLabel('Replace the current desk with this backup', { exact: true }).check();
  await press(s, s.page.getByRole('button', { name: 'Restore this desk', exact: true }));
  await closed(s.page); await saved(s.page);
}
async function freshDesk(s) {
  await closeDialog(s);
  await press(s, s.page.locator('#tools-button'));
  await press(s, s.page.getByText('Start a fresh desk', { exact: true }));
  await press(s, s.page.getByRole('button', { name: 'Make a fresh desk…', exact: true }));
  await s.page.locator('#fresh-confirm').fill('NEW DESK');
  await press(s, s.page.getByRole('button', { name: 'Start empty', exact: true }));
  await closed(s.page); await saved(s.page);
  await countMail(s, 0, 0);
}
async function writeReplyTo(s, parentId, body) {
  await closeDialog(s);
  while (await s.page.locator('#reader-previous').isEnabled()) {
    await press(s, s.page.locator('#reader-previous')); await saved(s.page);
  }
  await press(s, s.page.locator(`#reader .postcard[data-message-id="${parentId}"]`).getByRole('button', { name: 'Write a reply', exact: true }));
  await s.page.locator('#postcard-message').fill(body); await saved(s.page);
  await press(s, s.page.getByRole('button', { name: 'Post reply', exact: true }));
  await closed(s.page); await saved(s.page);
}
async function readerIds(s) {
  const cards = s.page.locator('#reader .message-list .postcard');
  const count = await cards.count();
  assert.ok(count <= 12, 'a long thread renders at most twelve postcards');
  return Promise.all(Array.from({length: count}, (_, index) => cards.nth(index).getAttribute('data-message-id')));
}
async function readerAnchor(s) { return s.page.locator('#reader .thread-reader').getAttribute('data-anchor-id'); }
async function filter(s, value) {
  await closeDialog(s);
  await s.page.locator('#view-filter').selectOption(value);
}
async function openThread(s, id) {
  await press(s, s.page.locator(`#board [data-thread-id="${id}"] .thread-open`));
  await saved(s.page);
}
async function threadAction(s, name) {
  await press(s, s.page.locator('#reader .thread-tools').getByRole('button', { name, exact: true }));
  await saved(s.page);
}
async function pack(s, filename) {
  await closeDialog(s);
  const boxes = s.page.locator('#board input[type="checkbox"]');
  const count = await boxes.count(); assert.ok(count > 0, 'nothing to carry');
  for (let i = 0; i < count; i++) {
    if (!(await boxes.nth(i).isChecked())) { await press(s, boxes.nth(i)); await saved(s.page); }
  }
  await press(s, s.page.locator('#pack-button'));
  await press(s, s.page.getByRole('button', { name: 'Review selected mail', exact: true }));
  return downloadPackPreview(s, filename);
}
async function downloadPackPreview(s, filename) {
  await s.page.getByRole('heading', { name: 'Before it leaves your desk', exact: true }).waitFor();
  const previewText = await s.page.locator('#modal .json-preview').textContent();
  const preview = JSON.parse(previewText);
  await inspectManifest(s, preview);
  const result = await saveDownload(s, () => press(s, s.page.getByRole('button', { name: 'Download mailbag', exact: true })), filename, 'actual mailbag download');
  await closed(s.page); await saved(s.page);
  assert.equal(result.text, previewText, 'downloaded UTF-8 text must exactly match the reviewed serialized mailbag');
  assert.deepEqual(result.data, preview, 'download must exactly match reviewed JSON');
  assert.equal(result.data.format, 'sneakernet-social-club/mailbag');
  assert.ok(result.bytes <= 5 * 1024 * 1024, 'download must fit its own mailbag import limit');
  return result;
}
async function inspectManifest(s, bag) {
  const expected = new Map(bag.messages.map(message => [message.id, message]));
  const found = new Set();
  while (await s.page.locator('#manifest-previous').isEnabled()) await press(s, s.page.locator('#manifest-previous'));
  for (let pageNumber = 0; ; pageNumber++) {
    assert.ok(pageNumber < Math.ceil(bag.messages.length / 12), 'manifest must terminate without repeating a page');
    const cards = s.page.locator('#modal .preview-message');
    const count = await cards.count();
    assert.ok(count > 0 && count <= 12, 'manifest builds at most twelve postcards at a time');
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i), id = await card.getAttribute('data-message-id');
      const message = expected.get(id);
      assert.ok(message && !found.has(id), 'every visible manifest row must be a distinct selected postcard');
      found.add(id);
      assert.equal(await card.locator('.preview-body').textContent(), message.body, 'the complete public text must be inspectable');
      assert.ok((await card.locator('.preview-message-heading').textContent()).includes(`@${message.handle}`));
      const paths = bag.routes.filter(route => route.messageId === id);
      assert.equal(await card.locator('.route').count(), paths.length);
      for (let path = 0; path < paths.length; path++) {
        const marks = await card.locator('.route').nth(path).locator('.manifest-journey > li').allTextContents();
        assert.equal(marks.length, paths[path].path.length);
        for (let mark = 0; mark < marks.length; mark++) {
          const expectedMark = paths[path].path[mark];
          assert.ok(marks[mark].includes(`@${expectedMark.handle}`));
          if (expectedMark.postmark) assert.ok(marks[mark].includes(expectedMark.postmark));
        }
      }
    }
    if (!(await s.page.locator('#manifest-next').isEnabled())) break;
    await press(s, s.page.locator('#manifest-next'));
  }
  assert.deepEqual([...found].sort(), [...expected.keys()].sort(), 'every selected postcard must be reachable in the manifest');
}
async function openOutboxReceipt(s, bagId) {
  await closeDialog(s);
  await press(s, s.page.locator('#outbox-button'));
  await s.page.getByRole('heading', { name: 'Outbox', exact: true }).waitFor();
  await press(s, s.page.locator(`.outbox-entry[data-bag-id="${bagId}"]`).getByRole('button', { name: 'View packing receipt', exact: true }));
  await s.page.getByRole('heading', { name: 'Packing receipt', exact: true }).waitFor();
  await s.page.locator(`.packing-receipt[data-bag-id="${bagId}"]`).waitFor();
}
async function downloadSameBag(s, bagId, filename) {
  await openOutboxReceipt(s, bagId);
  const previewText = await s.page.locator('#modal .json-preview').textContent();
  const result = await saveDownload(s, () => press(s, s.page.locator('#outbox-download')), filename, 'actual repeated download from private packing receipt');
  assert.equal(result.text, previewText, 'repeat file bytes must match the original receipt JSON');
  await saved(s.page);
  return result;
}
async function choose(s, control, path) {
  const waiting = s.page.waitForEvent('filechooser');
  await press(s, control);
  const chooser = await waiting;
  await chooser.setFiles(path);
}
async function openBag(s, path, { accept = true, repeated = false, keepMailCall = false } = {}) {
  await closeDialog(s);
  await choose(s, s.page.locator('#open-button'), path);
  await s.page.getByRole('heading', { name: 'A mailbag has arrived', exact: true }).waitFor();
  const preview = JSON.parse(await s.page.locator('#modal .json-preview').textContent());
  const stats = await s.page.locator('#modal .mini-stat').allTextContents();
  let mailCall = null;
  if (accept) {
    await press(s, s.page.getByRole('button', { name: repeated ? 'Open again (no changes)' : 'Accept mailbag', exact: true }));
    await saved(s.page);
    if (repeated) await closed(s.page);
    else {
      await s.page.getByRole('heading', { name: 'Mail call', exact: true }).waitFor();
      await s.page.locator('#modal .mail-call-summary').waitFor();
      mailCall = await s.page.locator('#modal .mail-call-summary').textContent();
      if (!keepMailCall) await closeDialog(s);
    }
  }
  return { preview, stats, mailCall };
}
async function countMail(s, threads, postcards) {
  assert.equal(await s.page.locator('#board .thread-card').count(), threads, 'thread count');
  assert.equal(await s.page.locator('#reader .postcard').count(), postcards, 'visible thread postcard count');
}
async function reopen(s) {
  const oldPage = s.page;
  await saved(oldPage);
  await oldPage.close();
  s.page = await s.context.newPage();
  await s.page.goto(origin, { waitUntil: 'domcontentloaded' });
  await ready(s.page);
  assert.equal(await s.page.evaluate(() => navigator.onLine), false);
}
async function screenshot(s, label) {
  const path = join(OUTPUT, 'screenshots', `${engine}-${label}.png`);
  await s.page.screenshot({ path, fullPage: true, animations: 'disabled' });
  return artifact(path, 'browser screenshot');
}
async function noOverflow(s) {
  const measurements = await s.page.evaluate(() => {
    const dialog = document.querySelector('#modal[open]');
    const rect = dialog?.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      dialog: rect ? { left: rect.left, right: rect.right, width: rect.width } : null };
  });
  assert.ok(measurements.document <= measurements.viewport + 1, `document overflows: ${JSON.stringify(measurements)}`);
  assert.ok(measurements.body <= measurements.viewport + 1, `body overflows: ${JSON.stringify(measurements)}`);
  if (measurements.dialog) {
    assert.ok(measurements.dialog.left >= -1 && measurements.dialog.right <= measurements.viewport + 1, 'dialog exceeds viewport');
  }
  return measurements;
}
async function tabTo(page, selector, max = 50) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(sel => document.activeElement?.matches(sel) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${selector} after ${max} Tab presses`);
}

async function main() {
  await mkdir(join(OUTPUT, 'files'), { recursive: true });
  await mkdir(join(OUTPUT, 'screenshots'), { recursive: true });
  const playwright = await import('playwright');
  assert.ok(['chromium', 'webkit'].includes(engine), 'SSC_BROWSER must be chromium or webkit');
  phase = 'browser launch';
  // Standard Playwright launch. No sandbox, socket, or policy bypass arguments.
  browser = await playwright[engine].launch({ headless });
  results.browser.version = browser.version();
  phase = 'local static server'; await startServer();
  phase = 'offline installation setup';
  const A = await session('A — Cumberland');
  const B = await session('B — carrier');
  const C = await session('C — DEF CON');
  const forkRelay = await session('Independent branch carrier');
  const orphanSource = await session('Reply-only source');
  const orphanTarget = await session('Reply-first recipient');
  const restored = await session('Restored desk');
  const legacyRestored = await session('Legacy backup migration');
  const keyboard = await session('Keyboard-only actions');
  const mobile390 = await session('390px touch', { mobile: true, width: 390, height: 844 });
  const mobile320 = await session('320px touch', { mobile: true, width: 320, height: 780 });
  const carrier = await session('Carrier tools');
  const carrierRecipient = await session('Repeated bag recipient');
  const carrierRestored = await session('Carrier restore and schema-2 migration');
  const largerSource = await session('Larger-desk source');
  const largerRecipient = await session('Larger-desk recipient');
  phase = 'acceptance checks';

  await check(planned[0], async () => {
    await countMail(A, 0, 0); await countMail(B, 0, 0); await countMail(C, 0, 0);
    const before = await backup(A, '00-empty-before-practice.json');
    await press(A, A.page.locator('#try-button'));
    for (const name of ['Send with a maker', 'Open at DEF CON', 'Bring the reply home']) {
      await press(A, A.page.getByRole('button', { name, exact: true }));
    }
    assert.equal(await A.page.locator('#modal .postcard').count(), 2);
    await press(A, A.page.locator('#modal [data-flip]').first());
    assert.ok((await A.page.locator('#modal .postcard-back').first().textContent()).includes('Cumberland Maker Meetup'));
    await press(A, A.page.getByRole('button', { name: 'Return to my desk', exact: true }));
    await closed(A.page);
    const after = await backup(A, '00-empty-after-practice.json');
    assert.deepEqual(withoutBackupTime(after.data.desk), withoutBackupTime(before.data.desk), 'practice must never change real desk data');
    await countMail(A, 0, 0);
    return { screenshot: await screenshot(A, 'desktop-empty'), practiceStages: 4, realMessagesAfterPractice: 0 };
  });

  await check(planned[1], async () => {
    await setStation(A, 'Mike', 'Cumberland Maker Meetup');
    await setStation(B, 'Morgan', 'Hamfest swap table');
    await setStation(C, 'Jules', 'DEF CON');
    const desks = [];
    for (const [s, label] of [[A, 'a'], [B, 'b'], [C, 'c']]) desks.push((await backup(s, `00-${label}-station.json`)).data.desk);
    const ids = desks.map(d => d.station.id);
    assert.equal(new Set(ids).size, 3);
    assert.ok(desks.every(d => d.messages.length === 0));
    return { distinctStationIds: ids, storageIsolation: 'three separate browser contexts' };
  });

  await check(planned[2], async () => {
    for (const s of sessions.values()) await s.context.setOffline(true);
    await stopServer({ beforeExchange: true });
    for (const s of sessions.values()) await reopen(s);
    return { installationsReopened: sessions.size, serverStopped: true, contextOffline: true, appUrl: origin };
  });

  await check(planned[3], async () => {
    await writePost(A, question);
    await countMail(A, 1, 1); await countMail(B, 0, 0); await countMail(C, 0, 0);
    await writePost(A, privateDraft, { keepDraft: true });
    await reopen(A);
    await press(A, A.page.locator('#write-button'));
    assert.equal(await A.page.locator('#postcard-message').inputValue(), privateDraft);
    await A.page.keyboard.press('Escape'); await closed(A.page);
    return { offlinePost: question, privateDraftSurvivedReopen: true };
  });

  let outboundA, outboundB, returnC, returnB, homeBackup, rootId, replyId;
  await check(planned[4], async () => {
    outboundA = await pack(A, '01-a-to-b.json');
    assert.equal(outboundA.data.messages.length, 1);
    rootId = outboundA.data.messages[0].id;
    assert.equal(JSON.stringify(outboundA.data).includes(privateDraft), false);
    for (const key of ['drafts', 'preferences', 'selected', 'seenBags', 'local']) assert.equal(Object.hasOwn(outboundA.data, key), false);
    const offered = await openBag(B, outboundA.path, { accept: false });
    await countMail(B, 0, 0);
    assert.equal(offered.preview.messages[0].body, question);
    await screenshot(B, 'desktop-arrival-preview');
    await press(B, B.page.getByRole('button', { name: 'Leave unopened', exact: true })); await closed(B.page);
    const unopened = await backup(B, '01-b-before-accept.json');
    assert.equal(unopened.data.desk.messages.length, 0);
    assert.equal(Object.keys(unopened.data.desk.seenBags).length, 0);
    await openBag(B, outboundA.path); await countMail(B, 1, 1);
    return { actualExport: relative(OUTPUT, outboundA.path), previewWasNonMutating: true, privateDraftExcluded: true };
  });

  await check(planned[5], async () => {
    outboundB = await pack(B, '02-b-to-c.json');
    await openBag(C, outboundB.path); await countMail(C, 1, 1);
    const cDesk = (await backup(C, '02-c-arrival.json')).data.desk;
    assert.deepEqual(cDesk.routes.find(r => r.messageId === rootId).path.map(p => p.handle), ['Mike', 'Mike', 'Morgan', 'Morgan', 'Jules']);
    return { actualExport: relative(OUTPUT, outboundB.path), originalIdPreserved: rootId };
  });

  await check(planned[6], async () => {
    await writePost(C, reply, { isReply: true }); await countMail(C, 1, 2);
    returnC = await pack(C, '03-c-to-b-with-reply.json');
    const message = returnC.data.messages.find(m => m.parentId === rootId);
    assert.ok(message); replyId = message.id;
    await openBag(B, returnC.path); await countMail(B, 1, 2);
    returnB = await pack(B, '04-b-to-a-home.json');
    await openBag(A, returnB.path); await countMail(A, 1, 2);
    return { actualExports: [relative(OUTPUT, returnC.path), relative(OUTPUT, returnB.path)], replyId, parentId: rootId };
  });

  await check(planned[7], async () => {
    homeBackup = await backup(A, '05-a-home-backup.json');
    assert.equal(homeBackup.data.desk.messages.length, 2);
    assert.equal(homeBackup.data.desk.messages.find(m => m.id === replyId).parentId, rootId);
    const path = homeBackup.data.desk.routes.find(r => r.messageId === rootId).path;
    assert.deepEqual(path.map(p => `${p.handle}:${p.kind}`), [
      'Mike:written', 'Mike:packed', 'Morgan:received', 'Morgan:packed', 'Jules:received', 'Jules:packed', 'Morgan:received', 'Morgan:packed', 'Mike:received',
    ]);
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    const visibleStamps = await A.page.locator(`#reader [data-message-id="${rootId}"] .postmark .stamp`).allTextContents();
    assert.equal(visibleStamps.length, path.length);
    for (let i = 0; i < path.length; i++) assert.ok(visibleStamps[i].includes(path[i].handle) && visibleStamps[i].includes(path[i].postmark));
    const shot = await screenshot(A, 'desktop-home-journey');
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    return { messages: 2, threads: 1, originalMarks: path.length, visibleJourneyMatchesExport: true, screenshot: shot };
  });

  await check(planned[8], async () => {
    for (let i = 0; i < 2; i++) await openBag(A, returnB.path, { repeated: true });
    const after = await backup(A, '06-a-after-two-replays.json');
    assert.deepEqual(withoutBackupTime(after.data.desk), withoutBackupTime(homeBackup.data.desk));
    await countMail(A, 1, 2);
    return { replayCount: 2, fullDeskUnchanged: true, actualFile: relative(OUTPUT, returnB.path) };
  });

  await check(planned[9], async () => {
    await openBag(C, outboundA.path);
    const desk = (await backup(C, '07-c-with-direct-shortcut.json')).data.desk;
    const paths = desk.routes.filter(r => r.messageId === rootId);
    assert.equal(paths.length, 2);
    assert.ok(paths.some(r => r.path.map(p => p.handle).join(',') === 'Mike,Mike,Jules'));
    assert.ok(paths.some(r => r.path.some(p => p.handle === 'Morgan')));
    return { knownPaths: 2, shorterCopyRetained: true };
  });

  await check(planned[10], async () => {
    await setStation(forkRelay, 'Lee', 'Repair café');
    await openBag(forkRelay, outboundA.path);
    const fork = await pack(forkRelay, '08-independent-branch-home.json');
    await openBag(A, fork.path);
    const desk = (await backup(A, '08-a-two-paths.json')).data.desk;
    const paths = desk.routes.filter(r => r.messageId === rootId);
    assert.equal(paths.length, 2);
    assert.ok(paths.some(r => r.path.some(p => p.handle === 'Lee')));
    assert.ok(paths.some(r => r.path.some(p => p.handle === 'Morgan')));
    assert.ok(paths.every(r => !(r.path.some(p => p.handle === 'Lee') && r.path.some(p => p.handle === 'Morgan'))));
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    assert.equal(await A.page.locator(`#reader [data-message-id="${rootId}"] .route`).count(), 2);
    const shot = await screenshot(A, 'desktop-distinct-paths');
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    return { knownPaths: 2, screenshot: shot, noCombinedFictionalPath: true };
  });

  await check(planned[11], async () => {
    // Normal thread packing includes every known parent. Make an explicitly
    // identified partial-delivery seed from the real C export, then use the UI
    // to import and re-export it. The target receives an actual app download.
    const seed = { ...structuredClone(returnC.data), id: `bag_${randomUUID()}` };
    seed.messages = seed.messages.filter(m => m.id === replyId);
    seed.routes = seed.routes.filter(r => r.messageId === replyId);
    const seedPath = join(OUTPUT, 'files', '09-partial-reply-seed-fixture.json');
    await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
    artifact(seedPath, 'explicit partial-delivery seed derived from actual C export');
    await setStation(orphanSource, 'Early mail carrier', 'Club sorting table');
    await setStation(orphanTarget, 'Early mail reader', 'Maker club');
    await openBag(orphanSource, seedPath);
    const actualReplyBag = await pack(orphanSource, '09-actual-exported-reply-only.json');
    assert.equal(actualReplyBag.data.messages.length, 1);
    await openBag(orphanTarget, actualReplyBag.path); await countMail(orphanTarget, 1, 1);
    assert.ok(await orphanTarget.page.locator('#reader .waiting-note').isVisible());
    await filter(orphanTarget, 'waiting');
    assert.equal(await orphanTarget.page.locator('#board .thread-card').count(), 1);
    await screenshot(orphanTarget, 'desktop-reply-before-parent');
    await filter(orphanTarget, 'inbox');
    await openBag(orphanTarget, outboundA.path); await countMail(orphanTarget, 1, 2);
    assert.equal(await orphanTarget.page.locator('#reader .waiting-note').count(), 0);
    const desk = (await backup(orphanTarget, '09-reconnected-desk.json')).data.desk;
    assert.equal(desk.messages.find(m => m.id === replyId).parentId, rootId);
    return { seedFixture: relative(OUTPUT, seedPath), deliveredActualExport: relative(OUTPUT, actualReplyBag.path), reconnected: true };
  });

  await check(planned[12], async () => {
    await A.page.getByLabel('Color mode', { exact: true }).selectOption('night'); await saved(A.page);
    const full = await backup(A, '10-complete-desk-for-restore.json');
    assert.equal(full.data.desk.drafts.post, privateDraft);
    await restoreBackup(restored, full.path); await reopen(restored);
    const copy = await backup(restored, '10-restored-desk-readback.json');
    assert.deepEqual(withoutBackupTime(copy.data.desk), withoutBackupTime(full.data.desk));
    await openBag(restored, returnB.path, { repeated: true });
    const replayed = await backup(restored, '10-restored-after-replay.json');
    assert.deepEqual(withoutBackupTime(replayed.data.desk), withoutBackupTime(full.data.desk));
    return { completeDeskRoundTrip: true, privateDraftRestored: true, replayReceiptRestored: true, comparisonExcludesOnlyNewBackupDownloadTime: true };
  });

  await check(planned[13], async () => {
    const before = await backup(A, '11-before-damaged-file.json');
    const broken = join(OUTPUT, 'files', '11-damaged-fixture.json');
    await writeFile(broken, '{"format":"sneakernet-social-club/mailbag","version":1,'); artifact(broken, 'deliberately damaged test fixture');
    await choose(A, A.page.locator('#open-button'), broken);
    await A.page.getByRole('heading', { name: 'This bag could not be opened', exact: true }).waitFor();
    assert.ok(await A.page.locator('#modal [role="alert"]').isVisible());
    await press(A, A.page.getByRole('button', { name: 'Back to the desk', exact: true })); await closed(A.page);
    const after = await backup(A, '11-after-damaged-file.json');
    assert.deepEqual(withoutBackupTime(after.data.desk), withoutBackupTime(before.data.desk));
    await countMail(A, 1, 2);
    return { explicitErrorShown: true, fullDeskUnchanged: true };
  });

  await check(planned[14], async () => {
    const screenshots = [];
    for (const mode of ['day', 'night', 'contrast']) {
      await A.page.getByLabel('Color mode', { exact: true }).selectOption(mode); await saved(A.page); await reopen(A);
      assert.equal(await A.page.locator('html').getAttribute('data-theme'), mode);
      await noOverflow(A); screenshots.push(await screenshot(A, `desktop-${mode}`));
    }
    return { viewport: { width: A.width, height: A.height }, modes: ['day', 'night', 'contrast'], screenshots };
  });

  await check(planned[15], async () => {
    const p = keyboard.page;
    await tabTo(p, '#station-button'); await p.keyboard.press('Enter');
    await p.locator('#station-handle').waitFor(); await tabTo(p, '#station-handle');
    await p.keyboard.type('Keymaker'); await p.keyboard.press('Tab'); await p.keyboard.type('Keyboard club');
    await tabTo(p, '#modal button[type="submit"]'); await p.keyboard.press('Enter'); await closed(p); await saved(p);
    await tabTo(p, '#write-button'); await p.keyboard.press('Enter');
    await p.locator('#postcard-message').waitFor(); await tabTo(p, '#postcard-message');
    await p.keyboard.type('A private keyboard draft.'); await saved(p);
    await p.keyboard.press('Escape'); await closed(p);
    await tabTo(p, '#write-button'); await p.keyboard.press('Enter');
    assert.equal(await p.locator('#postcard-message').inputValue(), 'A private keyboard draft.');
    await tabTo(p, '#postcard-message');
    await p.keyboard.press('Control+Enter'); await closed(p); await saved(p);
    await countMail(keyboard, 1, 1);
    await tabTo(p, '#reader [data-flip]'); await p.keyboard.press('Enter');
    assert.ok(await p.locator('#reader .postcard-back').isVisible());
    return { keys: ['Tab', 'Enter', 'Escape', 'Control+Enter'], draftRetainedAfterEscape: true, cardBackReachable: true, screenshot: await screenshot(keyboard, 'keyboard-postmark-focus') };
  });

  await check(planned[16], async () => {
    await setStation(mobile390, 'Pocket390', 'Maker meetup');
    await openBag(mobile390, outboundA.path);
    await writePost(mobile390, 'I can carry this from my phone.', { isReply: true });
    await countMail(mobile390, 1, 2);
    const bag = await pack(mobile390, '12-mobile390-actual-mailbag.json');
    assert.equal(bag.data.messages.length, 2);
    await reopen(mobile390); await countMail(mobile390, 1, 2);
    const screenshots = [], geometry = [];
    for (const mode of ['day', 'night', 'contrast']) {
      await mobile390.page.getByLabel('Color mode', { exact: true }).selectOption(mode); await saved(mobile390.page);
      geometry.push(await noOverflow(mobile390)); screenshots.push(await screenshot(mobile390, `touch390-${mode}`));
    }
    await press(mobile390, mobile390.page.locator('#reader [data-flip]').first());
    geometry.push(await noOverflow(mobile390)); screenshots.push(await screenshot(mobile390, 'touch390-postmarks'));
    const repeated = await downloadSameBag(mobile390, bag.data.id, '12-mobile390-same-outbox-bag.json');
    assert.equal(repeated.text, bag.text);
    geometry.push(await noOverflow(mobile390)); screenshots.push(await screenshot(mobile390, 'touch390-packing-receipt'));
    await closeDialog(mobile390);
    return { emulatedTouch: true, physicalPhone: false, viewport: { width: 390, height: 844 }, geometry, screenshots, actualExport: relative(OUTPUT, bag.path), sameBagFromOutbox: relative(OUTPUT, repeated.path) };
  });

  await check(planned[17], async () => {
    await setStation(mobile320, 'Pocket320', 'Pocket post office');
    await writePost(mobile320, 'A postcard from a narrow pocket.');
    await openBag(mobile320, outboundA.path);
    const bag = await pack(mobile320, '13-mobile320-actual-mailbag.json');
    assert.equal(bag.data.messages.length, 2);
    assert.equal(await mobile320.page.locator('#board .thread-card').count(), 2);
    const geometry = [await noOverflow(mobile320)];
    await press(mobile320, mobile320.page.locator('#write-button'));
    geometry.push(await noOverflow(mobile320));
    const composeScreenshot = await screenshot(mobile320, 'touch320-compose');
    await mobile320.page.keyboard.press('Escape'); await closed(mobile320.page);
    await openOutboxReceipt(mobile320, bag.data.id);
    assert.equal(await mobile320.page.locator('#modal .json-preview').textContent(), bag.text);
    geometry.push(await noOverflow(mobile320));
    const receiptScreenshot = await screenshot(mobile320, 'touch320-packing-receipt');
    await closeDialog(mobile320);
    await reopen(mobile320);
    return { emulatedTouch: true, physicalPhone: false, viewport: { width: 320, height: 780 }, geometry,
      screenshots: [composeScreenshot, receiptScreenshot, await screenshot(mobile320, 'touch320-desk')], actualExport: relative(OUTPUT, bag.path) };
  });

  let featureArrival, featureReplyId;
  await check(planned[19], async () => {
    // A new reply-only fixture is carried through the normal public file input.
    // Its public fields derive from an actual exported reply; all new record
    // identifiers are explicit. No local/private state is injected.
    const originalReply = returnC.data.messages.find(message => message.id === replyId);
    featureReplyId = `msg_${randomUUID()}`;
    const fixture = {
      ...structuredClone(returnC.data), id: `bag_${randomUUID()}`,
      messages: [{ ...originalReply, id: featureReplyId, body: 'Another reply from the DEF CON parts table. The encoder is still yours.' }],
      routes: returnC.data.routes.filter(route => route.messageId === replyId).map(route => ({
        messageId: featureReplyId, path: route.path.map(mark => ({ ...mark, id: `mark_${randomUUID()}` })),
      })),
    };
    const fixturePath = join(OUTPUT, 'files', '14-new-reply-fixture.json');
    await writeFile(fixturePath, `${JSON.stringify(fixture)}\n`);
    artifact(fixturePath, 'explicit new-reply fixture derived from actual C export');
    featureArrival = { id: fixture.id, path: fixturePath };
    const opening = await openBag(A, fixturePath, { keepMailCall: true });
    assert.ok(opening.mailCall.includes('new replies'));
    assert.equal(await A.page.locator('#modal .mail-call-reader').count(), 0);
    await screenshot(A, 'desktop-mail-call-summary');
    await closeDialog(A);
    const unread = await backup(A, '14-arrival-before-reading.json');
    assert.equal(unread.data.desk.local.readMessageIds.includes(featureReplyId), false, 'accepting/summary does not mark mail read');
    await press(A, A.page.locator('#arrivals-button'));
    await press(A, A.page.locator(`.arrival-entry[data-bag-id="${fixture.id}"]`).getByRole('button', { name: 'Open this arrival', exact: true }));
    await press(A, A.page.locator('#mail-call-start'));
    await A.page.locator(`.mail-call-reader[data-message-id="${featureReplyId}"]`).waitFor();
    await saved(A.page);
    assert.ok((await A.page.locator('.mail-call-reader').textContent()).includes(fixture.messages[0].body));
    await press(A, A.page.locator('.mail-call-reader [data-flip]'));
    assert.ok(await A.page.locator('.mail-call-reader .postcard-back').isVisible());
    await screenshot(A, 'desktop-mail-call-reading');
    await closeDialog(A);
    const read = await backup(A, '14-arrival-after-reading.json');
    assert.equal(read.data.desk.local.readMessageIds.includes(featureReplyId), true);
    assert.equal(read.data.desk.local.arrivals.at(-1).bagId, fixture.id);

    // Reading an already-read card creates no desk revision. Exercise the
    // cached main reader while Mail Call independently starts that card front
    // side up, then return through both ordinary exits.
    await filter(A, 'all'); await openThread(A, rootId);
    const mainCard = A.page.locator(`#reader .postcard[data-message-id="${featureReplyId}"]`);
    for (const exit of ['close', 'whole-thread']) {
      if (!(await mainCard.locator('.postcard-back').isVisible())) await press(A, mainCard.locator('[data-flip]'));
      assert.equal(await mainCard.locator('.postcard-back').isVisible(), true);
      await press(A, A.page.locator('#arrivals-button'));
      await press(A, A.page.locator(`.arrival-entry[data-bag-id="${fixture.id}"]`).getByRole('button', { name: 'Open this arrival', exact: true }));
      await press(A, A.page.locator('#mail-call-start'));
      await A.page.locator(`.mail-call-reader[data-message-id="${featureReplyId}"]`).waitFor();
      assert.equal(await A.page.locator('.mail-call-reader .postcard-body').textContent(), fixture.messages[0].body);
      assert.equal(await A.page.locator('.mail-call-reader .postcard-back').count(), 0);
      if (exit === 'close') await closeDialog(A);
      else {
        await press(A, A.page.getByRole('button', { name: 'Read the whole thread', exact: true }));
        await closed(A.page); await saved(A.page);
      }
      assert.equal(await mainCard.locator('.postcard-back').isVisible(), true, 'Mail Call must preserve the main reader’s current side');
      assert.match(await mainCard.locator('[data-flip]').textContent(), /Back to message/);
      await press(A, mainCard.locator('[data-flip]'));
      assert.equal(await mainCard.locator('.postcard-body').textContent(), fixture.messages[0].body, 'One back-to-message activation must show the front');
      assert.equal(await mainCard.locator('.postcard-back').count(), 0);
    }
    return { acceptedSummaryLeavesUnread: true, explicitReadingMarksOneMessage: true, independentFlipStateAcrossMailCallExits: ['close', 'whole-thread'], publicFixture: relative(OUTPUT, fixturePath) };
  });

  await check(planned[20], async () => {
    await filter(A, 'all'); await openThread(A, rootId);
    await threadAction(A, 'Mark all as unread');
    const counts = {};
    for (const value of ['unread', 'replies', 'mine', 'carrying', 'waiting']) {
      await filter(A, value);
      counts[value] = await A.page.locator('#board .thread-card').count();
    }
    assert.deepEqual(counts, { unread: 1, replies: 1, mine: 1, carrying: 1, waiting: 0 });
    await filter(A, 'all'); await openThread(A, rootId);
    await filter(A, 'unread'); assert.equal(await A.page.locator('#board .thread-card').count(), 0);
    await filter(A, 'replies'); assert.equal(await A.page.locator('#board .thread-card').count(), 0);
    await filter(A, 'inbox');
    return { unreadFilterCounts: counts, explicitThreadOpenMarksThreadRead: true, waitingFilterExercisedDuringReplyFirstCheck: true };
  });

  await check(planned[21], async () => {
    await openThread(A, rootId);
    await threadAction(A, 'Bookmark thread');
    await threadAction(A, 'Follow replies');
    await threadAction(A, 'Archive thread');
    await filter(A, 'inbox'); assert.equal(await A.page.locator('#board .thread-card').count(), 0);
    await filter(A, 'archived'); assert.equal(await A.page.locator('#board .thread-card').count(), 1);
    const privateState = await backup(A, '15-private-thread-flags.json');
    for (const key of ['bookmarkedThreadIds', 'followedThreadIds', 'archivedThreadIds']) assert.ok(privateState.data.desk.local[key].includes(rootId));
    await reopen(A); await filter(A, 'archived'); await openThread(A, rootId);
    assert.ok(await A.page.locator('#reader .thread-tools').getByRole('button', { name: 'Remove bookmark', exact: true }).isVisible());
    assert.ok(await A.page.locator('#reader .thread-tools').getByRole('button', { name: 'Stop following', exact: true }).isVisible());
    await threadAction(A, 'Return to desk');
    await filter(A, 'bookmarked'); assert.equal(await A.page.locator('#board .thread-card').count(), 1);
    await filter(A, 'inbox');
    const publicBag = await pack(A, '15-public-mail-private-flags-excluded.json');
    for (const key of ['local', 'readingPositions', 'readMessageIds', 'bookmarkedThreadIds', 'archivedThreadIds', 'followedThreadIds', 'lastBackupAt', 'arrivals', 'drafts', 'preferences', 'selected']) {
      assert.equal(publicBag.text.includes(`"${key}":`), false, `${key} must never travel`);
    }
    return { privateFlagsSurviveReopen: true, archiveReversible: true, publicFileContainsOnlyExchangeData: true };
  });

  await check(planned[22], async () => {
    await writePost(A, 'PRIVATE REPLY DRAFT — only the owner can resume this.', { isReply: true, keepDraft: true });
    await press(A, A.page.locator('#drafts-button'));
    await A.page.getByRole('heading', { name: 'Private drafts', exact: true }).waitFor();
    assert.equal(await A.page.locator('#modal .draft-item').count(), 2);
    await press(A, A.page.getByRole('button', { name: 'Resume reply', exact: true }));
    assert.equal(await A.page.locator('#postcard-message').inputValue(), 'PRIVATE REPLY DRAFT — only the owner can resume this.');
    await A.page.locator('#postcard-message').fill('');
    await A.page.keyboard.press('Escape'); await closed(A.page); await saved(A.page); await reopen(A);
    await press(A, A.page.locator('#drafts-button'));
    assert.equal(await A.page.locator('#modal .draft-item').count(), 1);
    await press(A, A.page.getByRole('button', { name: 'Resume postcard', exact: true }));
    assert.equal(await A.page.locator('#postcard-message').inputValue(), privateDraft);
    await A.page.locator('#postcard-message').fill('');
    await A.page.keyboard.press('Escape'); await closed(A.page); await saved(A.page);
    await press(A, A.page.locator('#drafts-button'));
    assert.equal(await A.page.locator('#modal .draft-item').count(), 0);
    await closeDialog(A);
    await writePost(A, privateDraft, { keepDraft: true });
    return { postAndReplyResume: true, erasingDraftSurvivesReopen: true, noDraftPublished: true };
  });

  await check(planned[23], async () => {
    assert.ok((await legacyRestored.page.locator('#backup-summary').textContent()).includes('No backup download yet'));
    const current = await backup(A, '16-current-version4-backup.json');
    assert.equal(current.data.version, 4); assert.equal(current.data.desk.schemaVersion, 4);
    assert.ok(Number.isFinite(Date.parse(current.data.desk.local.lastBackupAt)));
    assert.ok((await A.page.locator('#backup-summary').textContent()).includes('Backup download started'));
    const oldDesk = structuredClone(homeBackup.data.desk);
    oldDesk.schemaVersion = 1; delete oldDesk.local;
    const legacy = { format: current.data.format, version: 1, exportedAt: homeBackup.data.exportedAt, desk: oldDesk };
    const fixturePath = join(OUTPUT, 'files', '16-legacy-version1-backup-fixture.json');
    await writeFile(fixturePath, `${JSON.stringify(legacy)}\n`);
    artifact(fixturePath, 'legacy backup migration fixture derived from actual downloaded desk');
    await restoreBackup(legacyRestored, fixturePath); await reopen(legacyRestored);
    const migrated = await backup(legacyRestored, '16-migrated-version4-backup.json');
    assert.equal(migrated.data.version, 4); assert.equal(migrated.data.desk.schemaVersion, 4);
    const oldFields = structuredClone(migrated.data.desk); oldFields.schemaVersion = 1; delete oldFields.local;
    assert.deepEqual(oldFields, oldDesk, 'migration preserves every preexisting desk field');
    assert.deepEqual(new Set(migrated.data.desk.local.readMessageIds), new Set(oldDesk.messages.map(message => message.id)));
    for (const key of ['bookmarkedThreadIds', 'archivedThreadIds', 'followedThreadIds', 'arrivals', 'readingPositions']) assert.deepEqual(migrated.data.desk.local[key], []);
    await openBag(legacyRestored, returnB.path, { repeated: true });
    assert.deepEqual(migrated.data.desk.local.outbox, [], 'migration must not invent old envelope receipts');
    return { legacyFixture: relative(OUTPUT, fixturePath), schema1MigratedTo4: true, legacyMailRead: true, originalFieldsPreserved: true, emptyOutbox: true, downloadStartedOnlyNotDiskConfirmation: true };
  });

  await check(planned[24], async () => {
    const before = await backup(A, '17-before-arrival-replay.json');
    await openBag(A, featureArrival.path, { repeated: true });
    await press(A, A.page.locator('#arrivals-button'));
    await A.page.getByRole('heading', { name: 'Recent arrivals', exact: true }).waitFor();
    assert.equal(await A.page.locator('#modal .arrival-entry').count(), before.data.desk.local.arrivals.length);
    assert.equal(await A.page.locator(`#modal .arrival-entry[data-bag-id="${featureArrival.id}"]`).count(), 1);
    await screenshot(A, 'desktop-recent-arrivals');
    await closeDialog(A);
    const after = await backup(A, '17-after-arrival-replay.json');
    assert.deepEqual(withoutBackupTime(after.data.desk), withoutBackupTime(before.data.desk));
    return { retainedArrivals: after.data.desk.local.arrivals.length, repeatAddsNoArrivalOrReadChanges: true };
  });

  await check(planned[25], async () => {
    const source = (await backup(A, '18-album-public-evidence.json')).data.desk;
    const entries = new Map();
    for (const route of source.routes) for (const mark of route.path) {
      const key = JSON.stringify([mark.stationId, mark.handle, mark.postmark]);
      if (!entries.has(key)) entries.set(key, { ...mark, messageIds: new Set() });
      entries.get(key).messageIds.add(route.messageId);
    }
    await press(A, A.page.locator('#album-button'));
    await A.page.getByRole('heading', { name: 'Postmark album', exact: true }).waitFor();
    assert.equal(await A.page.locator('#modal .album-entry').count(), entries.size);
    for (const entry of entries.values()) {
      const card = A.page.locator(`.album-entry[data-station-id="${entry.stationId}"]`).filter({ hasText: entry.handle });
      assert.equal(await card.count(), 1);
      assert.ok((await card.locator('.album-count').textContent()).includes(`On ${entry.messageIds.size} postcard`));
      assert.equal(await card.locator('button[data-message-id]').count(), entry.messageIds.size);
    }
    await A.page.locator('#album-search').fill('mOrGaN');
    assert.equal(await A.page.locator('#modal .album-entry').count(), 1);
    assert.ok((await A.page.locator('.album-entry').textContent()).includes('Hamfest swap table'));
    await A.page.locator('#album-search').fill('');
    await screenshot(A, 'desktop-postmark-album');
    assert.equal((await A.page.locator('#modal').textContent()).includes(privateDraft), false);
    await closeDialog(A);
    await filter(A, 'all'); await openThread(A, rootId);
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    assert.equal(await A.page.locator(`#reader [data-message-id="${rootId}"] .route`).count(), 2);
    await press(A, A.page.locator(`#reader [data-message-id="${rootId}"] [data-flip]`));
    return { stationLabelEntries: entries.size, postcardsCountedOncePerEntry: true, handleSearchCaseInsensitive: true, rootPathsRemainSeparate: 2 };
  });

  await check(planned[26], async () => {
    const source = (await backup(A, '19-keepsake-public-evidence.json')).data.desk;
    const localOnlyPostmark = 'PRIVATE UNUSED STATION LABEL — never volunteered on mail';
    await setStation(A, 'Mike', localOnlyPostmark);
    await filter(A, 'all'); await openThread(A, rootId);
    await threadAction(A, 'Print keepsake');
    await A.page.getByRole('heading', { name: 'Print a keepsake', exact: true }).waitFor();
    const preview = A.page.locator('#modal .keepsake-preview');
    assert.equal(await preview.locator('.keepsake-front').count(), 3);
    assert.equal(await preview.locator('.keepsake-back').count(), 3);
    const html = await preview.innerHTML();
    assert.equal(html.includes(privateDraft), false);
    assert.equal(html.includes(localOnlyPostmark), false);
    for (const message of source.messages) {
      assert.ok((await preview.locator(`.keepsake-front[data-message-id="${message.id}"]`).textContent()).includes(message.body));
      const back = preview.locator(`.keepsake-back[data-message-id="${message.id}"]`);
      const routes = source.routes.filter(route => route.messageId === message.id);
      assert.equal(await back.locator('.keepsake-path').count(), routes.length);
      for (let i = 0; i < routes.length; i++) {
        const marks = await back.locator('.keepsake-path').nth(i).locator('.keepsake-stamp').allTextContents();
        assert.equal(marks.length, routes[i].path.length);
        for (let j = 0; j < marks.length; j++) assert.ok(marks[j].includes(routes[i].path[j].handle) && marks[j].includes(routes[i].path[j].postmark));
      }
    }
    assert.equal(await A.page.locator('#keepsake-print').isEnabled(), true);
    assert.equal(await A.page.locator('#print-sheet').count(), 0, 'print tree is created only by the explicit print action');
    await screenshot(A, 'desktop-keepsake-preview');
    await closeDialog(A);
    return { publicFronts: 3, publicBacks: 3, privateDraftAndUnusedStationExcluded: true, separatePathsInRecordedOrder: true, printDOMInspected: true, physicalPrintExercised: false };
  });

  let carrierOriginal, carrierUpdated, carrierOriginalDesk;
  const carrierReply = 'Another encoder has reached this carrier. This reply was written after the first packing.';
  await check(planned[27], async () => {
    await setStation(carrier, 'Packing keeper', 'Carrier workbench');
    await setStation(carrierRecipient, 'Repeat receiver', 'Next club table');
    const empty = await backup(carrier, '20-empty-carrier-desk.json');
    assert.equal(empty.data.desk.schemaVersion, 4);
    assert.deepEqual(empty.data.desk.local.outbox, []);
    await press(carrier, carrier.page.locator('#outbox-button'));
    await carrier.page.getByRole('heading', { name: 'Outbox', exact: true }).waitFor();
    assert.equal(await carrier.page.locator('#modal .outbox-entry').count(), 0);
    await closeDialog(carrier);
    await openBag(carrier, outboundA.path);
    const imported = await backup(carrier, '20-imported-carrier-desk.json');
    assert.deepEqual(imported.data.desk.local.outbox, [], 'incoming bags must not invent a local packed record');
    await press(carrier, carrier.page.locator('#pack-button'));
    assert.equal(await carrier.page.locator(`.packing-item[data-thread-id="${rootId}"] .packing-status`).getAttribute('data-packing-state'), 'unrecorded');
    await closeDialog(carrier);
    return { freshAndImportedOutboxesEmpty: true, schemaVersion: 4, originalExportImported: relative(OUTPUT, outboundA.path) };
  });

  await check(planned[28], async () => {
    await writePost(carrier, privateDraft, { keepDraft: true });
    carrierOriginal = await pack(carrier, '21-carrier-original-bag.json');
    const snapshot = await backup(carrier, '21-carrier-original-receipt.json');
    carrierOriginalDesk = snapshot.data.desk;
    assert.equal(carrierOriginalDesk.local.outbox.length, 1);
    const receipt = carrierOriginalDesk.local.outbox[0];
    assert.equal(receipt.bagId, carrierOriginal.data.id);
    assert.equal(receipt.packedAt, carrierOriginal.data.packedAt);
    assert.deepEqual([...receipt.messageIds].sort(), carrierOriginal.data.messages.map(message => message.id).sort());
    assert.deepEqual(receipt.pathHeads.map(head => `${head.messageId}:${head.markId}`).sort(), carrierOriginal.data.routes.map(route => `${route.messageId}:${route.path.at(-1).id}`).sort());
    for (const key of ['drafts', 'preferences', 'selected', 'seenBags', 'local', 'outbox']) assert.equal(Object.hasOwn(carrierOriginal.data, key), false);
    assert.equal(carrierOriginal.text.includes(privateDraft), false);
    await openOutboxReceipt(carrier, receipt.bagId);
    assert.equal(await carrier.page.locator('#modal .json-preview').textContent(), carrierOriginal.text);
    assert.equal(await carrier.page.locator('#modal .preview-message').count(), carrierOriginal.data.messages.length);
    assert.equal((await carrier.page.locator('#modal .manifest-list').textContent()).includes(privateDraft), false);
    for (const message of carrierOriginal.data.messages) assert.ok((await carrier.page.locator('#modal .manifest-list').textContent()).includes(message.body));
    await screenshot(carrier, 'desktop-packing-receipt');
    await closeDialog(carrier);
    await press(carrier, carrier.page.locator('#pack-button'));
    assert.equal(await carrier.page.locator(`.packing-item[data-thread-id="${rootId}"] .packing-status`).getAttribute('data-packing-state'), 'unchanged');
    assert.equal(await carrier.page.locator('#select-changed').isEnabled(), false, 'there are no changed threads to select');
    await press(carrier, carrier.page.locator('#clear-packing-selection'));
    assert.equal(await carrier.page.getByRole('button', { name: 'Review selected mail', exact: true }).isEnabled(), false);
    await closeDialog(carrier);
    return { originalBag: relative(OUTPUT, carrierOriginal.path), privateReceiptCount: 1, unchangedAfterPacking: true, publicFileExcludesLocalOutbox: true };
  });

  await check(planned[29], async () => {
    const before = await backup(carrier, '22-carrier-before-repeat-download.json');
    const repeated = await downloadSameBag(carrier, carrierOriginal.data.id, '22-carrier-same-bag.json');
    assert.equal(repeated.text, carrierOriginal.text, 'repeat download must preserve every original byte');
    assert.equal(repeated.suggestedName, carrierOriginal.suggestedName, 'repeat keeps the original bag filename');
    const after = await backup(carrier, '22-carrier-after-repeat-download.json');
    assert.deepEqual(withoutBackupTime(after.data.desk), withoutBackupTime(before.data.desk), 'repeat download must not append packed marks or an outbox entry');
    await openBag(carrierRecipient, carrierOriginal.path);
    const recipientBefore = await backup(carrierRecipient, '22-recipient-before-repeat-import.json');
    await openBag(carrierRecipient, repeated.path, { repeated: true });
    const recipientAfter = await backup(carrierRecipient, '22-recipient-after-repeat-import.json');
    assert.deepEqual(withoutBackupTime(recipientAfter.data.desk), withoutBackupTime(recipientBefore.data.desk));
    assert.deepEqual(recipientAfter.data.desk.local.outbox, [], 'another station’s outbox must not travel with the bag');
    return { exactBytes: true, originalFilename: repeated.suggestedName, noNewMarksOrPackingRecord: true, recipientImportIdempotent: true };
  });

  await check(planned[30], async () => {
    await filter(carrier, 'all'); await openThread(carrier, rootId);
    await writePost(carrier, carrierReply, { isReply: true });
    await press(carrier, carrier.page.locator('#pack-button'));
    const status = carrier.page.locator(`.packing-item[data-thread-id="${rootId}"] .packing-status`);
    assert.equal(await status.getAttribute('data-packing-state'), 'changed');
    assert.ok((await status.textContent()).includes('1 new postcard'));
    await press(carrier, carrier.page.locator('#clear-packing-selection'));
    assert.equal(await carrier.page.getByRole('button', { name: 'Review selected mail', exact: true }).isEnabled(), false);
    await press(carrier, carrier.page.locator('#select-changed'));
    assert.equal(await carrier.page.locator(`.packing-item[data-thread-id="${rootId}"] input[type="checkbox"]`).isChecked(), true);
    await closeDialog(carrier);

    // The old receipt still describes the old bag. Choosing its current
    // threads is a separate explicit action with a new full packing preview.
    await openOutboxReceipt(carrier, carrierOriginal.data.id);
    assert.equal(await carrier.page.locator('#modal .json-preview').textContent(), carrierOriginal.text);
    assert.equal((await carrier.page.locator('#modal .manifest-list').textContent()).includes(carrierReply), false);
    await press(carrier, carrier.page.locator('#outbox-pack-current'));
    await carrier.page.getByRole('heading', { name: 'What will you carry?', exact: true }).waitFor();
    assert.equal(await carrier.page.locator(`.packing-item[data-thread-id="${rootId}"] input[type="checkbox"]`).isChecked(), true);
    await press(carrier, carrier.page.getByRole('button', { name: 'Review selected mail', exact: true }));
    carrierUpdated = await downloadPackPreview(carrier, '23-carrier-updated-bag.json');
    assert.notEqual(carrierUpdated.data.id, carrierOriginal.data.id);
    assert.equal(carrierUpdated.data.messages.length, 2);
    assert.ok(carrierUpdated.data.messages.some(message => message.body === carrierReply && message.parentId === rootId));
    const originalPath = carrierOriginal.data.routes.find(route => route.messageId === rootId).path;
    const updatedPath = carrierUpdated.data.routes.find(route => route.messageId === rootId).path;
    assert.deepEqual(updatedPath.slice(0, originalPath.length), originalPath);
    assert.equal(updatedPath.length, originalPath.length + 1);
    assert.equal(updatedPath.at(-1).kind, 'packed');
    const updatedDesk = (await backup(carrier, '23-carrier-two-packed-records.json')).data.desk;
    assert.deepEqual(updatedDesk.local.outbox.map(entry => entry.bagId), [carrierOriginal.data.id, carrierUpdated.data.id]);
    const oldAgain = await downloadSameBag(carrier, carrierOriginal.data.id, '23-original-bag-after-new-packing.json');
    assert.equal(oldAgain.text, carrierOriginal.text, 'a newer route extension must not rewrite the original receipt');
    await openBag(carrierRecipient, carrierUpdated.path);
    await countMail(carrierRecipient, 1, 2);
    await closeDialog(carrier);
    await press(carrier, carrier.page.locator('#outbox-button'));
    assert.equal(await carrier.page.locator('#modal .outbox-entry').count(), 2);
    assert.equal(await carrier.page.locator('#modal .outbox-entry').first().getAttribute('data-bag-id'), carrierUpdated.data.id);
    await screenshot(carrier, 'desktop-outbox-after-repacking');
    return { changedSelectionDetected: true, originalBagStillExact: true, updatedBag: relative(OUTPUT, carrierUpdated.path), freshBagId: carrierUpdated.data.id, twoPrivateReceipts: true };
  });

  await check(planned[31], async () => {
    await closeDialog(carrier); await filter(carrier, 'all'); await openThread(carrier, rootId);
    await threadAction(carrier, 'Bookmark thread');
    await threadAction(carrier, 'Follow replies');
    const current = await backup(carrier, '24-current-schema4-carrier-backup.json');
    assert.equal(current.data.version, 4); assert.equal(current.data.desk.schemaVersion, 4);
    assert.equal(current.data.desk.local.outbox.length, 2);
    const version2Desk = structuredClone(current.data.desk);
    version2Desk.schemaVersion = 2; delete version2Desk.local.outbox; delete version2Desk.local.readingPositions;
    const version2Backup = { ...structuredClone(current.data), version: 2, desk: version2Desk };
    const fixturePath = join(OUTPUT, 'files', '24-schema2-backup-migration-fixture.json');
    await writeFile(fixturePath, `${JSON.stringify(version2Backup)}\n`);
    artifact(fixturePath, 'schema-2 migration fixture derived from an actual downloaded desk; outbox intentionally absent');
    await restoreBackup(carrierRestored, fixturePath); await reopen(carrierRestored);
    const migrated = await backup(carrierRestored, '24-migrated-schema4-backup.json');
    assert.equal(migrated.data.version, 4); assert.equal(migrated.data.desk.schemaVersion, 4);
    assert.deepEqual(migrated.data.desk.local.outbox, [], 'old packed marks do not prove an original bag ID or membership');
    const oldFields = structuredClone(migrated.data.desk);
    oldFields.schemaVersion = 2; delete oldFields.local.outbox; delete oldFields.local.readingPositions;
    assert.deepEqual(withoutBackupTime(oldFields), withoutBackupTime(version2Desk), 'all existing schema-2 mail, read markers, flags, drafts, receipts and preferences must survive');

    await restoreBackup(carrierRestored, current.path); await reopen(carrierRestored);
    const restored = await backup(carrierRestored, '24-restored-outbox-backup.json');
    assert.deepEqual(withoutBackupTime(restored.data.desk), withoutBackupTime(current.data.desk));
    const repeated = await downloadSameBag(carrierRestored, carrierOriginal.data.id, '24-original-bag-from-restored-outbox.json');
    assert.equal(repeated.text, carrierOriginal.text);
    return { schema2MigratedTo4: true, previousLocalStatePreserved: true, noInventedLegacyOutbox: true, schema4BackupRestoresOutbox: true, originalBytesRebuiltAfterRestore: true };
  });

  let largerBag, largerBackup, firstPageChoice, hiddenPageChoice, hiddenPageBody;
  const largerCount = 27;
  await check(planned[32], async () => {
    await setStation(largerSource, 'Long-desk sender', 'Fictional club sorting table');
    await setStation(largerRecipient, 'Long-desk reader', 'Fictional receiving table');
    for (let i = 1; i <= largerCount; i++) {
      await writePost(largerSource, `Long-desk postcard ${String(i).padStart(2, '0')} — a spare part for project ${i}.`);
    }
    assert.equal(await largerSource.page.locator('#board .thread-card').count(), 12);
    assert.ok((await largerSource.page.locator('#board-page-status').textContent()).includes(`of ${largerCount}`));
    await press(largerSource, largerSource.page.locator('#pack-button'));
    assert.equal(await largerSource.page.locator('.packing-item[data-thread-id]').count(), 12);
    if (await largerSource.page.locator('#clear-packing-selection').isEnabled()) await press(largerSource, largerSource.page.locator('#clear-packing-selection'));
    await largerSource.page.locator('#packing-search').fill('Long-desk postcard 01');
    assert.equal(await largerSource.page.locator('.packing-item[data-thread-id]').count(), 1);
    await press(largerSource, largerSource.page.locator('#select-changed'));
    assert.ok((await largerSource.page.locator('#packing-selection-count').textContent()).includes(`${largerCount} threads selected`), 'bulk selection must include changed threads outside the current search and page');
    await largerSource.page.locator('#packing-search').fill('');
    await press(largerSource, largerSource.page.locator('#packing-next'));
    assert.equal(await largerSource.page.locator('.packing-item[data-thread-id] input:checked').count(), 12);
    await press(largerSource, largerSource.page.locator('#packing-next'));
    assert.equal(await largerSource.page.locator('.packing-item[data-thread-id] input:checked').count(), 3);
    await press(largerSource, largerSource.page.getByRole('button', { name: 'Review selected mail', exact: true }));
    largerBag = await downloadPackPreview(largerSource, '25-larger-source-actual-bag.json');
    assert.equal(largerBag.data.messages.length, largerCount);
    const offered = await openBag(largerRecipient, largerBag.path, { accept: false });
    await inspectManifest(largerRecipient, offered.preview);
    await closeDialog(largerRecipient);
    await openBag(largerRecipient, largerBag.path);
    assert.equal(await largerRecipient.page.locator('#board .thread-card').count(), 12);
    return { authoredThroughNormalControls: largerCount, actualExport: relative(OUTPUT, largerBag.path), completeManifestPages: 3, publicFileImportedOffline: true, bulkSelectionIncludesHiddenMatches: true };
  });

  await check(planned[33], async () => {
    await filter(largerRecipient, 'all');
    const discovered = [];
    firstPageChoice = await largerRecipient.page.locator('#board .thread-card').first().getAttribute('data-thread-id');
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      const cards = largerRecipient.page.locator('#board .thread-card');
      assert.equal(await cards.count(), pageNumber < 2 ? 12 : 3);
      for (let i = 0; i < await cards.count(); i++) discovered.push(await cards.nth(i).getAttribute('data-thread-id'));
      if (pageNumber < 2) await press(largerRecipient, largerRecipient.page.locator('#board-next'));
    }
    assert.deepEqual(discovered.slice().sort(), largerBag.data.messages.map(message => message.id).sort());
    hiddenPageChoice = discovered.at(-1);
    hiddenPageBody = largerBag.data.messages.find(message => message.id === hiddenPageChoice).body;
    await press(largerRecipient, largerRecipient.page.locator(`#board [data-thread-id="${hiddenPageChoice}"] input[type="checkbox"]`));
    await saved(largerRecipient.page);
    await press(largerRecipient, largerRecipient.page.locator('#board-previous'));
    await press(largerRecipient, largerRecipient.page.locator('#board-previous'));
    await press(largerRecipient, largerRecipient.page.locator(`#board [data-thread-id="${firstPageChoice}"] input[type="checkbox"]`));
    await saved(largerRecipient.page);
    await largerRecipient.page.locator('#search').fill(hiddenPageBody);
    assert.equal(await largerRecipient.page.locator('#board .thread-card').count(), 1);
    assert.equal(await largerRecipient.page.locator('#board .thread-card').getAttribute('data-thread-id'), hiddenPageChoice);
    assert.equal(await largerRecipient.page.locator('#board input[type="checkbox"]').isChecked(), true);
    assert.ok((await largerRecipient.page.locator('#carry-count').textContent()).includes('2 threads'));
    await largerRecipient.page.locator('#search').fill('');
    await reopen(largerRecipient);
    await filter(largerRecipient, 'carrying');
    assert.equal(await largerRecipient.page.locator('#board .thread-card').count(), 2);
    const carried = await backup(largerRecipient, '26-larger-carry-and-read-state.json');
    assert.deepEqual([...carried.data.desk.selected].sort(), [firstPageChoice, hiddenPageChoice].sort());
    assert.deepEqual(carried.data.desk.local.readMessageIds, [], 'paging, carry toggles, search, and reopening must not silently mark mail read');
    await filter(largerRecipient, 'all');
    return { distinctThreadsReachable: discovered.length, carryChoicesPreservedAcrossPagesAndReopen: 2, searchCoversHiddenPages: true, implicitReadChanges: 0 };
  });

  await check(planned[34], async () => {
    largerBackup = await backup(largerRecipient, '27-larger-complete-desk.json');
    const source = largerBackup.data.desk;
    await press(largerRecipient, largerRecipient.page.locator('#tools-button'));
    if (await largerRecipient.page.locator('#desk-capacity').getAttribute('open') === null) await press(largerRecipient, largerRecipient.page.locator('#desk-capacity > summary'));
    const expected = {
      messages: [source.messages.length, 2000],
      routes: [source.routes.length, 4000],
      totalSteps: [source.routes.reduce((sum, route) => sum + route.path.length, 0), 20000],
      longestPath: [Math.max(0, ...source.routes.map(route => route.path.length)), 512],
      receivedBags: [Object.keys(source.seenBags).length, 20000],
      backupBytes: [largerBackup.bytes, 20 * 1024 * 1024],
    };
    for (const [key, [used, limit]] of Object.entries(expected)) {
      const row = largerRecipient.page.locator(`#desk-capacity [data-capacity-key="${key}"]`);
      assert.equal(Number(await row.getAttribute('data-used')), used, `${key} usage must describe the actual desk`);
      assert.equal(Number(await row.getAttribute('data-limit')), limit);
    }
    await screenshot(largerRecipient, 'desktop-larger-desk-capacity');
    await closeDialog(largerRecipient);
    await restoreBackup(carrierRestored, largerBackup.path);
    await reopen(carrierRestored);
    const recovered = await backup(carrierRestored, '27-larger-restored-desk.json');
    assert.deepEqual(withoutBackupTime(recovered.data.desk), withoutBackupTime(source));
    await openBag(carrierRestored, largerBag.path, { repeated: true });
    const repeated = await backup(carrierRestored, '27-larger-restored-after-replay.json');
    assert.deepEqual(withoutBackupTime(repeated.data.desk), withoutBackupTime(source));
    return { capacityMatchesActualBackup: true, completeRestoredMessages: recovered.data.desk.messages.length, schemaVersionUnchanged: recovered.data.desk.schemaVersion, repeatImportAfterRestoreIsNoOp: true };
  });

  await check(planned[35], async () => {
    const paths = [];
    for (const s of [mobile320, mobile390]) {
      await restoreBackup(s, largerBackup.path);
      await reopen(s);
      await filter(s, 'all');
      assert.equal(await s.page.locator('#board .thread-card').count(), 12);
      await press(s, s.page.locator('#board-next'));
      assert.ok((await s.page.locator('#board-page-status').textContent()).includes('13–24'));
      await s.page.locator('#search').fill(hiddenPageBody);
      assert.equal(await s.page.locator('#board .thread-card').count(), 1);
      await s.page.locator('#search').fill('');
      const geometry = [await noOverflow(s)];
      await press(s, s.page.locator('#pack-button'));
      await s.page.locator('#packing-search').fill(hiddenPageBody);
      assert.equal(await s.page.locator('.packing-item[data-thread-id]').count(), 1);
      assert.equal(await s.page.locator('.packing-item[data-thread-id] input').isChecked(), true);
      geometry.push(await noOverflow(s));
      await closeDialog(s);
      await press(s, s.page.locator('#tools-button'));
      if (await s.page.locator('#desk-capacity').getAttribute('open') === null) await press(s, s.page.locator('#desk-capacity > summary'));
      assert.equal(await s.page.locator('#desk-capacity [data-capacity-key="messages"]').isVisible(), true);
      geometry.push(await noOverflow(s));
      const shot = await screenshot(s, `touch${s.width}-larger-capacity`);
      await closeDialog(s);
      paths.push({ width: s.width, emulatedTouch: true, physicalPhone: false, geometry, screenshot: shot });
    }
    return { paths, ordinaryDownloadedBackupRestored: relative(OUTPUT, largerBackup.path), hiddenCarryChoicePreserved: true };
  });

  // Reuse completed carrier contexts as independent fresh participants. These
  // are ordinary Fresh desk controls, not direct storage writes or fixtures.
  const longSource = carrier, longReader = carrierRecipient;
  let longBag, longRootId, longOrder, longResumeBackup, longSavedBackup;
  await check(planned[36], async () => {
    await freshDesk(longSource); await freshDesk(longReader);
    await setStation(longSource, 'Long-thread writer', 'Fictional Cumberland reading table');
    await setStation(longReader, 'Long-thread reader', 'Fictional club receiving table');
    await writePost(longSource, 'Long conversation: a rotary encoder repair log.');
    longRootId = await longSource.page.locator('#reader .postcard').getAttribute('data-message-id');
    for (let i = 1; i <= 26; i++) {
      await writeReplyTo(longSource, longRootId, `Repair reply ${String(i).padStart(2, '0')}: observation ${i} for the rotary encoder conversation.`);
    }
    await writePost(longSource, privateDraft, { keepDraft: true });
    longBag = await pack(longSource, '29-long-thread-actual-export.json');
    assert.equal(longBag.data.messages.length, 27);
    assert.ok(longBag.data.messages.every(message => message.id === longRootId || message.parentId === longRootId));
    assert.equal(longBag.text.includes(privateDraft), false);
    assert.equal(longBag.text.includes('"readingPositions"'), false);
    // Public message arrays have canonical ID order. All replies are direct
    // children, so causal display is the root followed by that received order.
    longOrder = [longRootId, ...longBag.data.messages.filter(message => message.id !== longRootId).map(message => message.id)];
    await openBag(longReader, longBag.path);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(0, 12));
    const preview = await backup(longReader, '29-long-thread-before-explicit-reading.json');
    assert.deepEqual(preview.data.desk.local.readMessageIds, [], 'automatic thread preview must not mark any page read');
    assert.deepEqual(preview.data.desk.local.readingPositions, [], 'automatic preview must not invent a reading position');
    const bulkRead = longReader.page.locator('#reader [data-thread-action="read"]');
    assert.equal(await bulkRead.textContent(), 'Mark all as read');
    await press(longReader, bulkRead); await saved(longReader.page);
    const allMarked = await backup(longReader, '29-long-thread-explicit-mark-all-read.json');
    assert.deepEqual([...allMarked.data.desk.local.readMessageIds].sort(), [...longOrder].sort(), 'Mark all is the explicit action that includes every section');
    assert.deepEqual(allMarked.data.desk.local.readingPositions, [], 'bulk read marking does not invent a reading place');
    assert.equal(await bulkRead.textContent(), 'Mark all as unread');
    await press(longReader, bulkRead); await saved(longReader.page);
    const allUnread = await backup(longReader, '29-long-thread-explicit-mark-all-unread.json');
    assert.deepEqual(allUnread.data.desk.local.readMessageIds, []);
    assert.deepEqual(allUnread.data.desk.local.readingPositions, []);
    await openThread(longReader, longRootId);
    const opened = await backup(longReader, '29-long-thread-first-page-read.json');
    assert.deepEqual([...opened.data.desk.local.readMessageIds].sort(), longOrder.slice(0, 12).sort());
    assert.deepEqual(opened.data.desk.local.readingPositions, [longRootId]);
    assert.equal(await readerAnchor(longReader), longRootId);
    assert.match(await longReader.page.locator('#reader-page-status').textContent(), /1–12 of 27/);
    return { authoredWithNormalControls: 27, actualOfflineExport: relative(OUTPUT, longBag.path), automaticPreviewReadCount: 0, explicitPageReadCount: 12, explicitMarkAllReadCount: 27, markAllUnreadClearsEverySection: true, bulkActionsDoNotInventReadingPosition: true, privatePositionExcludedFromBag: true };
  });

  await check(planned[37], async () => {
    await press(longReader, longReader.page.locator('#reader-first-unread')); await saved(longReader.page);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(12, 24));
    assert.equal(await readerAnchor(longReader), longOrder[12]);
    assert.match(await longReader.page.locator('#reader-page-status').textContent(), /13–24 of 27/);
    longResumeBackup = await backup(longReader, '30-long-thread-middle-reading-position.json');
    assert.deepEqual([...longResumeBackup.data.desk.local.readMessageIds].sort(), longOrder.slice(0, 24).sort());
    assert.deepEqual(longResumeBackup.data.desk.local.readingPositions, [longOrder[12]]);
    await reopen(longReader);
    assert.equal(await readerAnchor(longReader), longOrder[12], 'offline reopen resumes the saved message, not the first or newest postcard');
    assert.deepEqual(await readerIds(longReader), longOrder.slice(12, 24));
    const reopened = await backup(longReader, '30-long-thread-after-offline-resume.json');
    assert.deepEqual(withoutBackupTime(reopened.data.desk), withoutBackupTime(longResumeBackup.data.desk), 'reopen previews the saved section without reading additional mail');
    await press(longReader, longReader.page.locator('#reader-first-unread')); await saved(longReader.page);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(24));
    assert.equal(await readerAnchor(longReader), longOrder[24]);
    const finished = await backup(longReader, '30-long-thread-all-pages-read.json');
    assert.deepEqual([...finished.data.desk.local.readMessageIds].sort(), [...longOrder].sort());
    assert.equal(await longReader.page.locator('#reader-first-unread').isEnabled(), false);
    return { resumedAnchor: longOrder[12], firstUnreadNavigatesToUnseenPage: true, pageCounts: [12, 12, 3], allReadOnlyAfterExplicitVisits: true };
  });

  await check(planned[38], async () => {
    const replyAnchor = longOrder[26];
    await press(longReader, longReader.page.locator(`#reader .postcard[data-message-id="${replyAnchor}"] [data-parent-id="${longRootId}"]`));
    await saved(longReader.page);
    assert.equal(await readerAnchor(longReader), longRootId);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(0, 12));
    assert.equal(await longReader.page.locator(`#reader .postcard[data-message-id="${longRootId}"]`).isVisible(), true);
    assert.equal(await longReader.page.locator('#reader-return').isVisible(), true);
    await press(longReader, longReader.page.locator('#reader-return')); await saved(longReader.page);
    assert.equal(await readerAnchor(longReader), replyAnchor);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(24));
    assert.equal(await longReader.page.locator(`#reader .postcard[data-message-id="${replyAnchor}"]`).isVisible(), true);
    longSavedBackup = await backup(longReader, '31-long-thread-after-parent-return.json');
    assert.deepEqual(longSavedBackup.data.desk.local.readingPositions, [replyAnchor]);
    assert.deepEqual(longSavedBackup.data.desk.messages.slice().sort((a, b) => a.id.localeCompare(b.id)), longBag.data.messages.slice().sort((a, b) => a.id.localeCompare(b.id)), 'reading and parent navigation do not change public postcards');
    return { crossPageParent: longRootId, returnToOriginatingReply: replyAnchor, exactMessageIdentityPreserved: true, screenshot: await screenshot(longReader, 'desktop-long-thread-parent-return') };
  });

  await check(planned[39], async () => {
    assert.equal(longSavedBackup.data.version, 4); assert.equal(longSavedBackup.data.desk.schemaVersion, 4);
    await restoreBackup(carrierRestored, longResumeBackup.path); await reopen(carrierRestored);
    assert.equal(await readerAnchor(carrierRestored), longOrder[12]);
    const recovered = await backup(carrierRestored, '32-reading-position-full-restore.json');
    assert.deepEqual(withoutBackupTime(recovered.data.desk), withoutBackupTime(longResumeBackup.data.desk));
    const carried = await pack(carrierRestored, '32-reading-position-public-export.json');
    assert.equal(carried.text.includes('"readingPositions"'), false);
    assert.equal(carried.text.includes('"readMessageIds"'), false);

    const version3Desk = structuredClone(longResumeBackup.data.desk);
    version3Desk.schemaVersion = 3; delete version3Desk.local.readingPositions;
    const legacyPath = join(OUTPUT, 'files', '32-schema3-reading-migration-fixture.json');
    await writeFile(legacyPath, `${JSON.stringify({...longResumeBackup.data, version: 3, desk: version3Desk})}\n`);
    artifact(legacyPath, 'explicit schema-3 fixture derived from an actual full backup; reading anchors intentionally absent');
    await restoreBackup(carrierRestored, legacyPath); await reopen(carrierRestored);
    const migrated = await backup(carrierRestored, '32-reading-position-migrated-from3.json');
    assert.deepEqual(migrated.data.desk.local.readingPositions, [], 'migration must not guess which card the owner was reading');
    const priorFields = structuredClone(migrated.data.desk);
    priorFields.schemaVersion = 3; delete priorFields.local.readingPositions;
    assert.deepEqual(withoutBackupTime(priorFields), withoutBackupTime(version3Desk));

    // A clearly identified partial-delivery seed is imported into a source
    // and re-exported through normal controls. The target receives that actual
    // downloaded orphan bag, followed by the actual complete original bag.
    const orphanId = longOrder[20];
    const seed = {...structuredClone(longBag.data), id: `bag_${randomUUID()}`};
    seed.messages = seed.messages.filter(message => message.id === orphanId);
    seed.routes = seed.routes.filter(route => route.messageId === orphanId);
    const seedPath = join(OUTPUT, 'files', '32-reading-position-orphan-seed.json');
    await writeFile(seedPath, `${JSON.stringify(seed)}\n`);
    artifact(seedPath, 'explicit partial-delivery seed from actual long-thread export');
    await freshDesk(orphanSource); await freshDesk(orphanTarget);
    await setStation(orphanSource, 'Reading-place carrier', 'Fictional sorting table');
    await setStation(orphanTarget, 'Reading-place owner', 'Fictional club desk');
    await openBag(orphanSource, seedPath);
    const actualOrphan = await pack(orphanSource, '32-reading-position-actual-orphan-export.json');
    await openBag(orphanTarget, actualOrphan.path);
    await openThread(orphanTarget, longRootId);
    assert.equal(await orphanTarget.page.locator('#reader .waiting-note').isVisible(), true);
    const waiting = await backup(orphanTarget, '32-reading-position-before-parent.json');
    assert.deepEqual(waiting.data.desk.local.readingPositions, [orphanId]);
    assert.deepEqual(waiting.data.desk.local.readMessageIds, [orphanId]);
    await openBag(orphanTarget, longBag.path);
    await reopen(orphanTarget);
    assert.equal(await readerAnchor(orphanTarget), orphanId, 'saved message identity survives changed positions when its ancestors arrive');
    assert.equal(await orphanTarget.page.locator('#reader .waiting-note').count(), 0);
    const joined = await backup(orphanTarget, '32-reading-position-after-parent.json');
    assert.equal(joined.data.desk.messages.length, 27);
    assert.deepEqual(joined.data.desk.local.readingPositions, [orphanId]);
    assert.deepEqual(joined.data.desk.local.readMessageIds, [orphanId], 'newly arrived neighboring cards stay unread until explicitly opened');
    await openBag(orphanTarget, longBag.path, { repeated: true });
    const replay = await backup(orphanTarget, '32-reading-position-after-parent-replay.json');
    assert.deepEqual(withoutBackupTime(replay.data.desk), withoutBackupTime(joined.data.desk));
    return { backupVersion: 4, restorePreservesAnchorAndUnread: true, schema3MigratesWithoutInventedPosition: true, publicExportsExcludeReadingState: true, orphanAnchorRetained: orphanId, actualOrphanExport: relative(OUTPUT, actualOrphan.path) };
  });

  await check(planned[40], async () => {
    // Continue in the already-open long thread using keyboard activation.
    await closeDialog(longReader);
    await tabTo(longReader.page, '#reader-previous', 120);
    await longReader.page.keyboard.press('Enter'); await saved(longReader.page);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(12, 24));
    await tabTo(longReader.page, '#reader-next', 120);
    await longReader.page.keyboard.press('Space'); await saved(longReader.page);
    assert.deepEqual(await readerIds(longReader), longOrder.slice(24));
    const paths = [];
    for (const s of [mobile320, mobile390]) {
      await restoreBackup(s, longResumeBackup.path); await reopen(s);
      assert.equal(await readerAnchor(s), longOrder[12]);
      assert.deepEqual(await readerIds(s), longOrder.slice(12, 24));
      const replyAnchor = longOrder[12];
      await press(s, s.page.locator(`#reader .postcard[data-message-id="${replyAnchor}"] [data-parent-id="${longRootId}"]`));
      await saved(s.page);
      assert.equal(await readerAnchor(s), longRootId);
      await press(s, s.page.locator('#reader-return')); await saved(s.page);
      assert.equal(await readerAnchor(s), replyAnchor);
      await press(s, s.page.locator('#reader-first-unread')); await saved(s.page);
      assert.deepEqual(await readerIds(s), longOrder.slice(24));
      const geometry = [], screenshots = [];
      for (const mode of ['day', 'night', 'contrast']) {
        await s.page.getByLabel('Color mode', { exact: true }).selectOption(mode); await saved(s.page);
        geometry.push(await noOverflow(s));
        screenshots.push(await screenshot(s, `touch${s.width}-long-thread-${mode}`));
      }
      await reopen(s);
      assert.equal(await readerAnchor(s), longOrder[24]);
      const resumed = await backup(s, `33-touch${s.width}-reader-resume.json`);
      assert.deepEqual(resumed.data.desk.local.readingPositions, [longOrder[24]]);
      paths.push({width: s.width, emulatedTouch: true, physicalPhone: false, geometry, screenshots, resumeAnchor: longOrder[24]});
    }
    return { keyboardPageActivation: ['Enter', 'Space'], paths, sourceWasActualDownloadedBackup: relative(OUTPUT, longResumeBackup.path) };
  });

  await check(planned[18], async () => {
    assert.deepEqual(results.pageErrors, []);
    return { uncaughtApplicationErrors: 0 };
  });
  results.status = 'passed';
}

try {
  await main();
} catch (error) {
  results.status = anyCheckStarted ? 'failed' : 'not-run';
  results.blocker = { phase, message: error.message, error: errorText(error) };
  if (!anyCheckStarted) console.error(`NOT RUN: ${phase} failed. No browser acceptance checks passed.\n${error.message}`);
  process.exitCode = 1;
} finally {
  for (const name of planned) if (!results.checks.some(c => c.name === name)) results.checks.push({ name, status: 'not-run', reason: 'Suite stopped before this check.' });
  await stopServer().catch(error => { results.shutdownError = error.message; });
  await browser?.close().catch(error => { results.shutdownError = error.message; });
  results.finishedAt = new Date().toISOString();
  results.summary = Object.fromEntries(['pass', 'fail', 'not-run'].map(status => [status, results.checks.filter(c => c.status === status).length]));
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(join(OUTPUT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Results: ${join(OUTPUT, 'results.json')}`);
  console.log(`${results.status.toUpperCase()}: ${results.summary.pass} passed, ${results.summary.fail} failed, ${results.summary['not-run']} not run.`);
}
