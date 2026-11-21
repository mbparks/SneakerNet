# Validation record — v1.5.0-rc.1

Recorded for the November 21, 2026 reading-improvements delivery.

## GitHub and web-directory packaging update

The subsequent distribution adds `web/`, a generated deployment directory,
plus a package guide, regeneration/parity commands, and a local `--web`
server option. All 15 application runtime files remain byte-for-byte
identical to the original v1.5.0-rc.1 ZIP. The application version and the
acceptance status below are unchanged.

[DELIVERY-PACKAGE-CHECKS.json](DELIVERY-PACKAGE-CHECKS.json) records the
packaging-specific verification. The 117-check and 27-check results below
retain their original provenance; this packaging update does not claim
another browser or device run.

## Release scope and acceptance

This batch adds 12-postcard reader sections, First unread, automatic resume
at a saved message, and parent/return navigation. Explicit reading marks only
the exposed section read. Automatic previews do not; whole-thread Mark all
remains a separate action. Public mailbags remain version 1. Private desks
and full backups use version 4, adding local `readingPositions`.

**Mike reported that v1.2 browser acceptance passed.** That historical result
remains in [USER-ACCEPTANCE.json](USER-ACCEPTANCE.json) and
[VALIDATION-v1.2.md](VALIDATION-v1.2.md). No itemized browser/OS/device matrix
was supplied. The v1.3 and v1.4 records remain in
[VALIDATION-v1.3.md](VALIDATION-v1.3.md) and
[VALIDATION-v1.4.md](VALIDATION-v1.4.md), with their historical evidence files.

**The current v1.5 browser suite was not run here.** Read-only resolution of
installed Playwright 1.62.1 found its normal Chromium headless-shell executable
absent (ENOENT). No browser process, page, or installation context started.
The current result is **0 passed, 0 failed, 41 not run**, with **16 planned
isolated contexts**. It is not a new-version pass inferred from v1.2.

Evidence: [BROWSER-PREFLIGHT-v1.5.json](BROWSER-PREFLIGHT-v1.5.json),
[BROWSER-RESULTS-v1.5.json](BROWSER-RESULTS-v1.5.json), and
[BROWSER-RUN-v1.5.txt](BROWSER-RUN-v1.5.txt).

## Executed checks and final verification

The compatibility and performance runs use Linux and Node.js 24.22.3. They
operate on fictional data and actual model source; they do not use browser
file controls or prove browser behavior.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Actual previous-release compatibility | **27 passed, 0 failed** | 9 each against the delivered v1.2.0, v1.3.0-rc.1, and v1.4.0-rc.1 core modules; [COMPATIBILITY-RESULTS-v1.5.json](COMPATIBILITY-RESULTS-v1.5.json) |
| Paired model performance | Completed | Three fictional collections; 25 operation pairs and 250 timed samples; [PERFORMANCE-RESULTS.json](PERFORMANCE-RESULTS.json) |
| Controller scheduling simulations | **8 passed** | Current application controller with explicit DOM/render/storage adapters; [controller-reading.test.mjs](../tests/controller-reading.test.mjs); included in the final combined suite |
| Prepared browser-suite syntax | Passed | `node --check tests/browser.acceptance.mjs`; parsing does not execute the suite |
| Current browser acceptance | **41 not run** | Normal executable unavailable; no desktop or emulated mobile controls exercised |
| Combined extracted-ZIP suite | **117 passed, 0 failed** | [CHECK-RESULTS.txt](CHECK-RESULTS.txt); Node model, storage, offline-shell, view, and controller simulations |
| Packaged-source syntax | Passed | 26 JavaScript modules and 3 Python files; [PACKAGE-CHECKS.json](PACKAGE-CHECKS.json) |
| Static serving and offline file integrity | Passed | 15 runtime files served with matching source bytes; 14 worker-cache checksums validated; no browser execution |
| Package completeness | Passed | ZIP CRC, every source checksum, version agreement, HTML asset/ID links, JSON records, and all 3 sample mailbags |

The combined checks ran from the extracted v1.5.0-rc.1 ZIP. Only release evidence and this report were updated afterward, then the ZIP was repacked and compared byte-for-byte with the source and checksum list.

Historical check and package files retain their version suffixes. Do not use
an older run as evidence that the v1.5 controller or mobile layout was tested.

## Reading and migration coverage

The new model cases cover section-only read marking, one saved message anchor
per current thread, anchor changes after conversation growth, orphan-thread
merges, malformed or cross-thread reading requests, private-export exclusion,
full-backup restore, exact old outbox files, stale-index rejection, and backup
capacity. They use stable IDs and recorded append order; station clocks do not
choose a saved place.

The reader's simulated DOM checks cover bounded construction, section
navigation, exact parent targets, Return to reply, missing parents, pending
and failed navigation, and focus-target lookup after a postcard is turned
over. These checks do not establish real keyboard focus, layout, screen-reader
announcements, or touch behavior.

Eight additional Node scheduling simulations execute controller functions
from the current `src/app.js` with the real core/reader modules and explicit
DOM, rendering, and storage adapters. They cover rapid P→Q→P visits, queued
Mark all/read actions, repaint after a superseded visit, late focus/modal
completion, posting alongside queued reading, logical focus targets, failed
save recovery, and asynchronous transform order. The adapters observe
requests and state; they do not certify actual browser focus or IndexedDB.

Legacy desk and backup schemas 1, 2, and 3 migrate to 4. Existing mail, paths,
private state, and schema-3 outbox receipts remain intact. Reading positions
start empty on older desks. Only schema-1 migration marks existing mail read;
schema-1/2 outboxes remain empty because those releases did not retain original
outgoing envelope IDs.

## Compatibility

The compatibility script extracts the actual prior `src/core.js` from each
kept release ZIP. The result records each archive and core SHA-256. All three
older releases accept current public bags, return replies to one current
thread, and treat the exact original repeat as a no-op. Their backups migrate
without losing prior fields or replay history. The v1.3 and v1.4 outbox files
still reconstruct exactly after upgrade, later replies, repacking, and restore.

A migrated desk can gain a private reading anchor, retain it through a v4
backup/restore, and pack a public file without exposing it. All three older
apps reject the new private backup version. Keep a backup made by the old app
before upgrading if rollback may be needed. Replacing static app files does
not reverse the local schema migration.

Reproduce with the kept archives:

```sh
python3 scripts/check-previous-release.py /path/to/Sneakernet-Social-Club-v1.2.0.zip /path/to/Sneakernet-Social-Club-v1.3.0-rc.1.zip /path/to/Sneakernet-Social-Club-v1.4.0-rc.1.zip
```

## Performance and offline limits

The fresh comparison uses actual v1.4 source and the v1.5 model. Each operation
has two warmups and five timed samples per release, with alternating order.
Semantic comparisons normalize the prior schema outside timing. Timed backup
operations use each release's own schema. Results are mixed; for example,
busy-tray board facts measured 3.725→4.102 ms and restore 123.381→132.055 ms,
while travelled-desk packing facts measured 2.428→2.229 ms. See
[PERFORMANCE.md](PERFORMANCE.md) for the full interpretation and limits.

These measurements exclude the DOM, IndexedDB, file pickers, service workers,
and phones. They do not time section navigation or a populated reading-position
list. The earlier v1.3/v1.4 measurements remain in
[PERFORMANCE-v1.4.md](PERFORMANCE-v1.4.md) and
[PERFORMANCE-RESULTS-v1.4.json](PERFORMANCE-RESULTS-v1.4.json).

The offline shell now includes `src/reader.js` among its 14 required assets.
The existing integrity-bound installation/repair behavior and transactional
mail storage remain. Actual hosted-update and disconnected browser runs
remain separate acceptance paths; simulated workers and HTTP byte checks do
not certify them.

## Desktop and mobile coverage

| Path | Actual status for this delivery |
| --- | --- |
| Prior-release Node protocol checks | Executed: 27 passed |
| Paired Node model timings | Executed; five samples per release/operation |
| Desktop browser UI, keyboard, themes, and offline exchange | Not run here |
| 390px and 320px emulated touch viewports | Prepared, not run here |
| Physical Android or iOS file pickers and sharing | Not exercised here; the prior user report did not itemize coverage |
| USB transfer, AirDrop, or OS share sheet | Not exercised here |
| Native printing or PDF print preview | Not exercised here |
| Earlier v1.2 browser acceptance | Passed, user reported; detailed paths unspecified |

No current screenshot review, GitHub publication, CI run, or live deployment
is claimed. Prepared screenshot captures are instructions for a future run,
not evidence produced by this delivery.

## Run the normal-control browser suite

On a machine where the test browser is available:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The 41 checks use 16 isolated contexts. They retain the offline A→B→C→B→A
exchange through actual exported files and normal import controls, replay,
early replies, separate paths, full restore, privacy, keyboard, color modes,
Mail Call, carrier tools, and larger-desk scenarios.

Five new cases use an actual exported 27-postcard conversation. They check
12/12/3 reading sections, automatic previews, section-only read state versus
Mark all, First unread, offline resume, parent/return navigation, v4 restore,
schema-3 migration, public exclusion, orphan reconnection, and keyboard plus
320px/390px touch paths. Completed contexts are reset through the ordinary
Fresh desk controls. No application state is injected into browser storage.
Clearly labeled partial-delivery and legacy-backup fixtures are distinct from
actual app downloads.

The static server stops after setup, and every context is switched offline
before exchange. Record the intended physical phone/file-transfer route and
hosted-update behavior using [MANUAL-CHECKS.md](MANUAL-CHECKS.md). Resolve
observed failures before promoting this candidate; preserve the v1.2 acceptance
as historical evidence.
