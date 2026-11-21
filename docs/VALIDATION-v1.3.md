# Validation record — v1.3.0-rc.1

Recorded for the November 21, 2026 carrier-tools delivery.

## Release scope and acceptance

This build adds a private Outbox, original packing receipts, exact repeat
bag downloads, current-thread repacking, and changed-thread choices. Public
mailbags remain version 1. Private desks/backups move to schema/version 3,
with migrations from versions 1 and 2.

**The v1.2 browser acceptance passed, as reported by Mike.** That accepted
baseline remains recorded in `USER-ACCEPTANCE.json` and
`VALIDATION-v1.2.md`. Its report did not itemize browsers, operating systems,
viewports, native printing, or physical phone transfer paths.

**The new v1.3 carrier flows were not exercised in a browser here.** The
read-only availability check found that the default Playwright Chromium
headless-shell executable is absent. No browser process or page was started.
The current suite is recorded as **0 passed, 0 failed, 32 not run**. This
candidate suffix applies to the new carrier release; the prior v1.2
acceptance has not been revoked or rewritten.

## Executed checks

Environment: Linux, Node.js 24.22.3, Python 3.12.14. The app has no runtime
package dependencies.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Existing protocol and private desk model | **28 passed** | Current core and desk-feature suites; Node logic, not browser installations |
| Carrier model and receipts | **12 passed** | Exact reconstruction, migration, comparisons, bounds, and malformed references |
| Offline-worker simulation | **12 passed** | Actual worker and runtime bytes, modeled browser APIs |
| Storage transaction simulation | **12 passed** | Revision/rollback behavior, schema-3 readiness, and outbox-preserving draft patches |
| Mail Call/album/keepsake simulated DOM | **7 passed** | Existing experience construction and interaction contracts |
| Outbox/receipt simulated DOM | **8 passed** | Original contents, repeat/repack hooks, ordering, search/pagination, and failure recovery |
| Combined extracted-ZIP suite | **79 passed, 0 failed** | `CHECK-RESULTS.txt` |
| Actual previous-release compatibility | **5 passed, 0 failed** | Current model against `core.js` extracted from the delivered v1.2.0 ZIP; `COMPATIBILITY-RESULTS.json` |
| JavaScript syntax | **16 files passed** | Application, worker, test, and sample-generation scripts |
| Python syntax | **2 files passed** | Static server and previous-release compatibility checker |
| Extracted app over localhost HTTP | **13 resources passed** | Exact source bytes and required MIME types; not proof of browser rendering |
| New carrier browser suite | **32 not run** | Missing default browser executable; `BROWSER-RESULTS-v1.3.json` |

The exact package checks and runtime hashes are in `PACKAGE-CHECKS.json`.
Historical v1.2 checks remain in `CHECK-RESULTS-v1.2.txt`,
`PACKAGE-CHECKS-v1.2.json`, and the original browser files.

## Carrier behavior checked

Preparing a new bag returns a detached candidate with new packed marks and
one private outbox receipt. The live input desk stays untouched until the
application commits the download action. The receipt holds the bag ID,
packing time, ordered message IDs, and original packed-path heads.

The carrier model cases establish:

- Schema-1 and schema-2 desks/backups migrate while preserving prior mail,
  routes, identities, drafts, preferences, selections, and supported private
  state. No historical outgoing envelopes are invented.
- Rebuilding a retained receipt gives the exact original serialized bytes
  after newer replies, extended paths, branching, station-label changes,
  backup/restore, and equivalent JSON object-key reordering.
- Re-downloading does not create a message, receipt, or mark. A recipient
  that already accepted the envelope returns its original desk unchanged.
- A receipt always ends each path at its original local packed mark. Separate
  paths remain separate, and later handoffs are excluded from the old bag.
- Packing comparisons use the latest intersecting receipt by insertion
  order, including clock reversals and orphan-thread regrouping. New means
  absent from that recorded packing, not a claim that nobody ever carried it.
- The 100-entry and 20,000-reference limits trim only whole old packing
  receipts. They preserve messages, routes, arrivals, and replay receipts.
- Private outbox data stays out of public bags and survives full backups.
- Invalid, missing, repeated, mismatched, or wrongly ordered heads are rejected,
  including a packed mark assigned to two recorded envelopes. Recorded bags
  remain inside the exact public import byte and step limits.

Storage tests additionally establish that a small draft save changes only
private drafts while retaining real core-generated outbox records. Stale
revisions, quota failures, invalid drafts, corrupt storage, and unmigrated
schema-1/schema-2 snapshots remain guarded.

The Outbox view tests use the real model and a simulated DOM. They check
recorded packing order, original receipt contents, byte-identical download
hooks, guarded repeat-download clicks, current-thread selection hooks,
search, pagination, missing receipts, and retry feedback. These tests do not
establish browser layout, actual downloads, native file controls, keyboard
execution, or physical-device behavior.

## Compatibility with the delivered v1.2 code

The compatibility checker extracted the actual v1.2.0 `src/core.js` from the
previous delivered ZIP and used it alongside the current model. Five cases
passed with fictional data:

1. v1.2 opened a newly packed v1.3 version-1 public bag.
2. A reply written and packed by v1.2 returned to one v1.3 thread.
3. The exact original v1.3 re-download was recognized as an already-accepted
   envelope by the v1.2 recipient, with no new state.
4. A version-2 full backup actually produced by v1.2 migrated to schema 3;
   its prior fields survived and its new outbox was empty.
5. A new v1.3 packing of the completed conversation still opened in v1.2.

Reproduce with the kept previous ZIP:

```sh
python3 scripts/check-previous-release.py /path/to/Sneakernet-Social-Club-v1.2.0.zip
```

This exercises the actual previous protocol implementation. It is still an
in-memory Node exchange, separate from normal browser file-control acceptance.

## Current browser availability result

The installed Playwright package is version 1.62.1. Its registry's normal
headless Chromium executable was checked read-only and returned ENOENT:

```text
/home/agent/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

The availability metadata is retained in `BROWSER-PREFLIGHT-v1.3.json` and
the resulting not-run record/log in `BROWSER-RESULTS-v1.3.json` and
`BROWSER-RUN-v1.3.txt`. No browser launch, alternative executable/channel,
installation, workaround, or escalation was used. The earlier local v1.2
launch result and the user's later v1.2 acceptance remain separate records.

## Reproducible normal-control browser suite

On a machine with Playwright's browser available:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The expanded suite defines **32 checks and 14 isolated contexts**. It retains
the original offline A→B→C→B→A file exchange, repeated import, early reply,
restore, keyboard, theme, and mobile-viewport cases. New cases cover empty
outbox migration, original receipt privacy, exact repeat bytes and filename,
recipient no-op, changed-thread selection, current-thread repacking,
schema-3 backup reconstruction, and schema-2 backup migration.

The 390px touch path adds an original-bag repeat download; the 320px path
opens a packing receipt and checks overflow. These are planned emulation
paths, not physical Android/iOS or OS-sharing results. The browser suite uses
ordinary app file inputs and actual downloads, not injected IndexedDB state.

The GitHub Actions workflow can run this suite after the source is pushed.
No GitHub publication, CI run, or hosted deployment was performed here.
`MANUAL-CHECKS.md` includes the new carrier and physical-device checklist.

## Remaining release check

Exercise the new carrier flows in the intended browser, preserve the
result, and resolve any failures before promoting this candidate to stable
v1.3. The existing user-reported v1.2 acceptance remains valid baseline
evidence. Physical phone, OS-transfer, native-print, and individual viewport
coverage should be described only when those paths are actually exercised.
