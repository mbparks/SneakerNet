# Validation record — v1.2.0

Recorded for the November 21, 2026 delivery.

## Release status

**Browser acceptance passed, as reported by the user.** The user confirmed
“browser acceptance passed” after receiving v1.2.0-rc.1. That confirmation
closes the browser acceptance gate and supports promotion to stable
**v1.2.0**.

No raw run log, browser/OS versions, viewport details, exact automated-test
count, or physical-phone/native-print coverage accompanied the confirmation.
The record therefore preserves the user-reported pass separately from the
build environment's own results; it does not invent a detailed test matrix.
The exact confirmation and its release scope are preserved in
[`USER-ACCEPTANCE.json`](USER-ACCEPTANCE.json).

The executed checks establish behavior of the data model and modeled
storage, worker, and experience APIs. They are not substituted for browser
acceptance, rendered-layout review, native printing, or physical phone tests.

## Evidence record

Environment: Linux, Node.js 24.22.3, Python 3.12.14. The app itself has no
runtime package dependencies.

| Check | Actual result | Evidence and limit |
| --- | --- | --- |
| Browser acceptance | **Passed — user reported** | User confirmation after v1.2.0-rc.1; environment, detailed cases, and exact test count were not supplied |
| Protocol and private desk model | **28 passed, 0 failed** | `core.test.mjs` and `desk-features.test.mjs`; isolated in-memory desks and real JSON serialization, not browser installations |
| Offline shell lifecycle/cache | **12 passed, 0 failed** | `offline-shell.test.mjs`; actual worker source and release bytes in modeled Node APIs |
| Storage transactions | **11 passed, 0 failed** | `storage.test.mjs`; modeled IndexedDB transaction failures and revision races, not browser storage durability |
| Mail Call, album, keepsake construction | **7 passed, 0 failed** | `experience.test.mjs`; actual modules and real model fixtures with a small simulated DOM adapter, not visual/browser/print acceptance |
| Combined dependency-free suite | **58 passed, 0 failed** | `npm test`; raw output in `CHECK-RESULTS-v1.2.txt` |
| JavaScript syntax and package structure | **Passed** | Exact counts in `PACKAGE-CHECKS-v1.2.json` |
| Extracted release static HTTP resources | **Passed** | Exact source bytes and MIME checks; a local HTTP response is not proof of browser execution |
| Historical local actual-browser attempt | **Not run: 27 checks** | The v1.2.0-rc.1 build-environment launch failed before any page or installation context opened; this historical result is unchanged |
| Desktop rendered UI / keyboard details | **Coverage not itemized** | The user reported browser acceptance passed without listing these cases; no local build-environment browser session or screenshots were produced |
| Mobile viewport/touch details | **Coverage not itemized** | The prepared 390×844 and 320×780 checks did not run locally; the user's viewport coverage was not specified |
| Physical Android / iOS, USB, OS sharing | **Coverage not reported** | No physical-device or transfer-path results were supplied |
| Native print or PDF output | **Coverage not reported** | Public document construction is tested locally; native output coverage was not supplied |

## What the model checks establish

The A→B→C→B→A scenario writes the Cumberland request, carries it through B
to C, writes the DEF CON reply, and returns it through B to A. It establishes
one thread containing both stable message IDs, with distinct paths for each
message. The original postcard's recorded sequence is:

| Step | Station | Act |
| --- | --- | --- |
| 1 | A / Cumberland | Written |
| 2 | A / Cumberland | Packed |
| 3 | B / carrier | Received |
| 4 | B / carrier | Packed |
| 5 | C / DEF CON | Received |
| 6 | C / DEF CON | Packed |
| 7 | B / carrier | Received |
| 8 | B / carrier | Packed |
| 9 | A / Cumberland | Received |

The reply starts its own path at C. It does not acquire the parent postcard's
outward journey. Separate returning branches and a later direct shortcut are
preserved; disagreeing station clocks do not reorder the recorded sequence.

Other executed cases establish:

- Reply-before-parent retention, onward packing, and automatic reconnection.
- Repeated bag imports as strict no-ops, and rejection of a reused bag ID
  whose contents changed.
- Atomic rejection of damaged JSON, unsupported fields/versions, conflicting
  message IDs, altered/spliced mark IDs, and circular reply chains.
- Selection-only public exports and full private backup/restore.
- The reproduced 1,850 × 2,000-character case: pretty JSON exceeds 5 MiB, but
  the exact compact export reopens. The importer accepts a boundary file at
  exactly 5 MiB including multibyte text/newline and rejects one extra byte.
- A supported desk's compact full backup fits the 20 MiB limit; an oversized
  multibyte draft candidate fails before persistence.
- Original schema-1 desk and backup migration preserves legacy values and
  treats old mail as read. Current backups round-trip schema 2.
- New authored mail is read; new imports are unread. A known card returning
  by another path retains its read state. Identity uses original station IDs.
- Private bookmarks, archive/follow choices, and carrying selections reconnect
  when early-reply groups acquire their ancestors.
- Arrival entries track actual received marks in acceptance order, even if
  the clock moves backwards. Bounded history trimming does not delete mail,
  routes, or replay receipts.

## What the simulations establish

The worker suite runs the actual `sw.js` against release-file bytes. It
checks atomic complete installation, scope-limited old-cache cleanup,
readiness, connected repair, failed repair, missing-asset responses, root and
subfolder navigation, and exclusion of user mail and unrelated URLs.

The storage suite checks that a draft save changes only drafts, snapshots
caller input, rejects stale or simultaneous revisions, rolls back quota
failures, refuses uninitialized or corrupt records, and broadcasts only
after a successful transaction. These are modeled browser API contracts.

The experience suite checks summary/read separation, new-reply-first
ordering, receipt highlights, read-save errors, album grouping and search,
thread links, empty states, public-only keepsakes with separate paths, and
temporary print-tree cleanup. It cannot establish CSS layout, browser focus,
native file dialogs, printer behavior, or accessibility-tool behavior.

An integration source review additionally found and fixed the restore/reset
failure race: a failed replacement must not adopt a newer persisted revision
while retaining the old desk. The new helper adopts data, revision, and
conflict state together only after a successful replacement write. This
review is distinct from actual browser failure-injection evidence.

## Historical local browser attempt — v1.2.0-rc.1

The v1.2.0-rc.1 default Playwright Chromium run was attempted once, using the
already installed Playwright package. It stopped at browser launch with:

```text
Executable doesn't exist at
/home/agent/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

The machine-readable result is **0 passed, 0 failed, 27 not run**. No page or
isolated browser installation was created. The temporary package-resolution
link was removed. No alternative launch, installation, or escalation was
used in this attempt. The original result and log are preserved as
`BROWSER-RESULTS.json` and `BROWSER-RUN.txt`.

The earlier v1.0.0-rc.1 attempt had a different failure: system Chromium
reported `socket() failed: Operation not permitted` in its process-singleton
startup. Automatic approval review rejected the requested escalation because
sandbox approval was disabled. A remote browser could not reach the local
server, and its error-page access was denied by URL policy. That historical
restriction is recorded here separately; it is not the error returned by the
v1.2.0-rc.1 local attempt. Neither historical local failure overrides the
later user-reported browser acceptance pass.

## Reproduce the actual-browser acceptance

On a machine that supports Playwright browser processes:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

`tests/browser.acceptance.mjs` defines 27 checks and 11 isolated contexts:
A/B/C, a branch relay, two early-reply desks, a restored desk, a legacy-restore
desk, a keyboard desk, and two mobile touch viewports. It warms the app caches,
switches every context offline, stops the static server, closes/reopens tabs,
then uses the normal app file inputs and actual downloads. It reads exported
backups for assertions; it does not inject application state or read
IndexedDB directly.

Every packed file is compared with the exact visible JSON preview and the
importer's byte cap. The suite checks repeated imports, early replies,
backup restore, private feature state, Mail Call, album, and keepsake DOM.
Its print check does not invoke a physical printer or certify native PDF
pagination. The partial-delivery seed for the orphan scenario is identified
explicitly and enters its sender through normal import controls.

Results, fictional exchange files, and screenshots go under `qa-results/`.
A dependency or browser launch failure is recorded as **not-run**, never as
a pass. Optional `SSC_BROWSER=webkit` runs a separately installed Playwright
WebKit engine; it still does not certify an iPhone or its OS file picker.

The supplied GitHub Actions workflow runs these checks after this source is
pushed to a repository. No repository publication, hosted deployment, or CI
run was performed here. `MANUAL-CHECKS.md` supplies the real-device checklist.

## Stable release decision

Promote **1.2.0-rc.1 → 1.2.0** on the user's browser acceptance confirmation.
This promotion updates the visible/package version, worker cache version,
and release metadata. Application behavior, public mailbag version 1, and
private desk schema 2 remain as accepted in the candidate.

The raw local browser result remains a historical **not-run** record rather
than being rewritten as a successful run. Physical-device, OS-sharing,
viewport, and native-print details can be added when reported; their absence
is recorded as a coverage limit, not a renewed approval or release gate.
