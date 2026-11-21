# Validation record — v1.4.0-rc.1

Recorded for the November 21, 2026 long-lived-desk delivery.

## Release scope and acceptance

This batch adds shared snapshot lookups, 12-item pages for the board/packing
choices/manifests, capacity in Desk tools, and offline assets bound to their
release. Public mailbags remain version 1; private desks and backups remain
version 3. Existing v1.3 outbox receipts are preserved. Schema-1 and schema-2
migration remains available.

**Mike reported that v1.2 browser acceptance passed.** That result remains
in `USER-ACCEPTANCE.json` and `VALIDATION-v1.2.md`; it was not accompanied by
an itemized browser/OS/device matrix. The v1.3 checks remain recorded in
`VALIDATION-v1.3.md` and its historical result files.

**The current v1.4 browser suite was not run here.** Read-only resolution of
the installed Playwright package found its default Chromium headless-shell
executable absent (ENOENT). No browser process, context, or page was started.
The record is **0 passed, 0 failed, 36 not run**, covering 16 planned isolated
contexts. This build is therefore delivered as a release candidate. The
previous user-reported v1.2 acceptance is not rewritten as a new-version pass.

## Executed checks

Environment: Linux, Node.js 24.22.3, Python 3.12.14. The app has no runtime
package dependencies. These results distinguish model/simulation checks from
real-browser acceptance.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Existing protocol/private-desk model | 28 passed | Empty start, three-station exchange, replay, orphans, distinct paths, exact byte limits, migrations and private notes |
| Carrier model and receipts | 12 passed | Exact original files, outbox bounds, malformed references and packing comparisons |
| Large-desk model | 6 passed | Indexed equivalence, search privacy, stale indexes, exact UTF-8 capacity and boundary preservation |
| Offline worker simulation | 15 passed | Actual worker/runtime bytes; modeled Fetch integrity and Cache APIs, including mixed-release rejection |
| Storage transaction simulation | 12 passed | Atomic/revision guards, failure recovery and outbox-preserving draft patches |
| Mail Call/album/keepsake simulated DOM | 7 passed | Existing construction and interaction contracts |
| Outbox/receipt simulated DOM | 8 passed | Original manifests, repeat/repack callbacks, search/paging and error states |
| Shared paging simulated DOM | 5 passed | Bounded rows, hidden selections, filter clamping, reveal and focus-request contracts |
| Combined extracted-ZIP suite | **93 passed, 0 failed** | `CHECK-RESULTS.txt`; no claim of browser acceptance |
| Actual previous-release compatibility | **15 passed, 0 failed** | 7 against v1.2.0 and 8 against v1.3.0-rc.1; `COMPATIBILITY-RESULTS-v1.4.json` |
| Paired performance measurements | Completed | Three fictional collections, five samples/operation; `PERFORMANCE-RESULTS.json` |
| JavaScript syntax | 22 files passed | Runtime, scripts, browser suite, unit suites and fixture generator |
| Python syntax | 3 files passed | Static server and both previous-release checkers |
| Extracted entry over localhost HTTP | 14 resources passed | Exact release bytes and expected MIME types; not browser rendering |
| Offline integrity check | 13 cached assets match | Generated embedded SHA-256 values; worker itself is not cached as an asset |
| ZIP integrity | Passed | CRC, SHA256SUMS and byte-for-byte archive/source comparison |
| Current browser acceptance | **36 not run** | Default browser executable missing; `BROWSER-RESULTS-v1.4.json` |

`PACKAGE-CHECKS.json` records package counts and runtime hashes. Historical
v1.2/v1.3 validation, check results, package checks and browser files remain
separate. The raw current availability result is in `BROWSER-PREFLIGHT-v1.4.json`.

## Large-desk and rendering decisions

The full 2,000-thread fixture checks every indexed read/packing fact against
the existing nonindexed behavior. Additional cases reconnect orphan threads,
follow the last appended receipt despite backwards clocks, reject an index
from another snapshot, keep search within postcard boundaries, and exclude
private drafts from search. Capacity matches exact reserved UTF-8 backup
bytes without modifying the desk.

A separate valid desk reaches 2,000 messages, 4,000 routes and 20,000 path
steps together. Another has a 512-step path; attempting another packing
fails atomically without deleting or shortening any marks. No protocol
capacity was raised in this release.

The simulated paging checks render only 12 rows from a 2,000-item source.
Selections remain in the caller through paging/search, filters clamp the
current page, hidden-row reveal finds the appropriate page, and programmatic
updates do not request focus. They do not establish actual focus behavior,
layout, screen-reader announcements, keyboard use, or touch interaction.

Source review found a shared flip-state issue when the main reader was
retained during search. Mail Call now uses its own flip-state scope. The
prepared browser case checks both closing Mail Call and returning through
Read the whole thread while an already-read main postcard is turned over.
That interaction has not been executed in a browser here.

## Offline-upgrade durability

The prior worker could repair a missing cached file from a newer hosting
release and then declare the shell complete. The new worker sends a
release-specific integrity value with each installation or repair request.
Mixed bytes returned with HTTP 200 fail the modeled Fetch integrity contract.

The actual-source worker simulations cover mixed installation, readiness
repair, direct repair, batch failure, evicted assets, canonical cache keys,
root/subfolder reopening, and no interception of user mail. Cleanup retains
newer, unknown-version and separately scoped caches. The current 13-file
integrity map is generated from the packaged runtime bytes.

This uses the request-fetch behavior in the [W3C Cache.addAll algorithm](https://www.w3.org/TR/service-workers/#dom-cache-addall)
and the integrity failure behavior in the [WHATWG Fetch standard](https://fetch.spec.whatwg.org/#main-fetch).
The simulations model these browser contracts; they do not substitute for an
actual hosted-update run. The manual checklist contains that remaining path.

After source edits, change the release version and run
`node scripts/refresh-shell-integrity.mjs`, then its `--check` mode. Publish
the complete release with content rewriting disabled. Normal hosting of the
delivered package needs no build step.

## Compatibility and measured performance

The compatibility script imports the actual previous core modules from the
kept delivered ZIPs, whose hashes are recorded in the result. Both previous
versions accept current public bags, return replies into one current thread,
and treat an exact original repeat as a no-op. Prior backups retain their
fields and replay history. The v1.3 outbox retains exact original files after
upgrade, new replies, repacking and full restore. Because both use schema 3,
v1.3 can also restore a current full backup. The v1.2 private backup schema
differs, so an old compatible backup remains necessary for that downgrade.

The paired model run measured a 2,000-thread board calculation at
164.761→4.414 ms and packing calculations at 75.579→7.182 ms. Both current
measurements include constructing a fresh index. Imports/backups/restores
show smaller or mixed changes; some measured operations are slightly slower.
`PERFORMANCE.md` reports all relevant limits and selected unchanged/slower
results. These timings exclude browser rendering, IndexedDB and phones.

Reproduce compatibility and measurements with the kept earlier archives:

```sh
python3 scripts/check-previous-release.py /path/to/Sneakernet-Social-Club-v1.2.0.zip /path/to/Sneakernet-Social-Club-v1.3.0-rc.1.zip
python3 scripts/check-performance.py /path/to/Sneakernet-Social-Club-v1.3.0-rc.1.zip
```

These are Node checks with fictional data, not normal browser file controls.

## Desktop and mobile coverage

| Path | Actual status for this delivery |
| --- | --- |
| Linux Node model, storage/worker simulations and simulated DOM | Executed as listed above |
| Extracted static app served over local HTTP | Executed; 14 files verified |
| Desktop browser UI, keyboard, themes and offline exchange | Not run here; current browser executable absent |
| 390px and 320px touch viewports | Prepared, not run here |
| Physical Android or iOS file pickers and sharing | Not exercised here; prior user report did not itemize coverage |
| USB transfer, AirDrop or OS share sheet | Not exercised here |
| Native printing or PDF print preview | Not exercised here |
| Earlier v1.2 browser acceptance | Passed, user reported; detailed paths unspecified |

No current screenshot review, GitHub publication, CI run or live deployment
was performed. The prepared suite's screenshot captures are for subsequent
human inspection, not evidence that exists from this run.

## Current normal-control browser suite

On a machine with the browser available:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The 36 checks use 16 isolated browser contexts. They retain the offline
A→B→C→B→A exchange using actual exported files and normal import controls,
repeat import, orphan-first delivery, distinct branches, full restore,
privacy, keyboard, modes, Mail Call and carrier cases.

New flows write 27 postcards through the UI while offline, select across
packing pages/search, inspect the complete multi-page manifest, export the
real file, and import it on another isolated desk. They check hidden-page
search, carry preservation, unread state, exact capacity against a full
backup, restored replay idempotence, and paging at 320px/390px touch widths.
No application state is injected into browser storage.

The static server stops after every context is warmed, and each context is
set offline before the exchange. Actual device transfer and hosted-update
paths remain in `MANUAL-CHECKS.md`. Resolve any failures on the intended
browser before promoting this candidate to stable. The existing v1.2
acceptance remains preserved baseline evidence.
