# Changelog

## 1.5.0-rc.1 — 2026-11-21

Reading longer conversations and returning to a saved place:

- The main reader shows 12 postcards per section, with Previous postcards,
  Next postcards, and First unread controls. Opening a thread resumes at its
  saved postcard; without a saved place, it opens at the first unread card.
- Explicit reading marks only the exposed section read. Automatic previews,
  reopening, and search leave unread state alone. Mark all as read and
  Mark all as unread remain separate whole-thread actions.
- Replies link to their known parent, including across sections, with Return
  to reply navigation. Stable message anchors survive late-parent reconnects
  and full backup/restore; temporary parent-return history stays in the tab.
- Controller saves preserve queued reading and posting changes. Eight Node
  scheduling simulations cover rapid navigation, asynchronous writes, save
  failures, and late focus/modal completion through explicit adapters.
- Private desk schema and full-backup version 4 add `readingPositions`.
  Schemas 1–3 migrate with prior data preserved and no invented reading place.
  Schema-3 outbox receipts still reconstruct their exact original bags.
- Public mailbags remain version 1. Reading positions never travel. Older
  apps reject version-4 private backups; retain an old-app backup for rollback.
- Actual prior-release compatibility passed 27 checks against v1.2, v1.3,
  and v1.4 ZIPs. The prepared browser suite has 41 checks in 16 contexts,
  including 320px/390px reading paths; it was not run here because the normal
  browser executable is unavailable. The v1.2 user acceptance stays separate.
- Fresh Node measurements compare the actual v1.4 model with v1.5 across
  three fictional desks. Results are mixed and retain all raw samples;
  they do not measure browser, phone, or reader-navigation latency.

Final automated and package verification is recorded in `docs/VALIDATION.md`.

## 1.4.0-rc.1 — 2026-11-21

Long-lived desks, measured against the delivered v1.3 candidate:

- Snapshot indexes share thread, route, read-state, receipt, and search
  lookups. A 2,000-thread fixture reduced board-fact calculation from
  164.761 ms to 4.414 ms and packing-fact calculation from 75.579 ms to
  7.182 ms in the recorded Node run. These are model timings, not phone or
  browser latency. Full results and slower/unchanged operations are retained.
- Board, packing choices, and readable manifests show 12 items per page.
  Search and bulk selection operate on the complete collection. Carry
  choices survive filtering and paging; the exact full JSON stays available.
- The main reader is retained during searches of an unchanged desk, and date
  formatting reuses one formatter. Mail Call and the main reader use
  independent postcard sides, avoiding stale flip controls when returning.
- Desk tools shows saved capacity counts and the exact reserved UTF-8 backup
  allowance. Existing limits remain; no mail or path is trimmed to fit.
- Offline shell installation and repair bind all required files to embedded
  SHA-256 checksums. Mismatched release bytes are refused. Cleanup preserves
  newer, unrecognized, and separately scoped caches. The source includes a
  checksum refresh/check script for edits.
- Public mailbags remain version 1 and private backups remain version 3.
  Existing schema-3 outbox receipts survive; versions 1 and 2 still migrate.
- 93 Node regression/simulation checks passed; 15 compatibility checks
  passed against actual v1.2 and v1.3 sources. Current browser suite has
  36 prepared checks in 16 contexts, not run here because the default browser
  executable is absent. The user's v1.2 acceptance remains separately recorded.

## 1.3.0-rc.1 — 2026-11-21

Carrier tools built on the accepted v1.2.0 desk:

- Private Outbox with searchable, paginated packing receipts in recorded
  packing order. Receipts describe packing, without claiming file delivery.
- Original receipt manifests retain every message and separate copy path as
  packed, even after more replies arrive or station details change.
- **Download same bag** reproduces the original canonical JSON and filename
  without adding a stamp or a receipt. Recipients recognize the original
  envelope and repeated acceptance remains a no-op.
- **Pack current threads** maps a receipt to the conversations known now and
  opens the normal selection and complete-manifest review for a new bag.
- Packing status shows unrecorded, changed, and unchanged threads relative
  to the last retained packing receipt. A bulk changed-thread choice and
  selection count make repeat carrying explicit.
- Compact immutable references retain up to 100 receipts / 20,000 ID
  references. Trimming an old convenience receipt does not delete mail,
  paths, or accepted-bag replay history.
- Private desk schema 3 and full-backup version 3; old desk/backup versions
  1 and 2 migrate with prior state preserved. The new outbox starts empty
  for old desks rather than inventing past envelopes.
- Public mailbag format stays version 1. Canonical serialization gives exact
  re-downloads even when equivalent JSON object keys were reordered.
- Updated offline caching, storage readiness, test suites, and actual
  previous-release protocol/backup compatibility check.

The user's v1.2 browser acceptance is preserved as baseline evidence. New
v1.3 carrier browser coverage is recorded separately in `docs/VALIDATION-v1.3.md`.

## 1.2.0 — 2026-11-21

Stable release, promoted from v1.2.0-rc.1 after Mike reported:
“browser acceptance passed.”

- Updated the visible application, package, and offline-cache version.
- Recorded the user-reported browser acceptance separately from the earlier
  local launch failure and the executed Node checks.
- Completed the roadmap through v1.2; v1.3 carrier tools is the next planned
  development batch.
- Preserved the accepted application behavior, private desk schema 2,
  version-2 full backups, and version-1 public mailbags. This promotion adds
  no migration or feature change.

The browser/OS/device matrix and native-print coverage were not supplied;
the release record does not infer those details or manufacture a 27-test
automated pass count.

## 1.2.0-rc.1

Stabilization, everyday desk, and Mail Call development batch:

- Exact compact UTF-8 mailbag and backup serializers validate the emitted
  bytes, including the final newline, against the recipient's import limit.
  This fixes a reproduced case where a valid 1,850-postcard bag became too
  large when the browser's download code pretty-printed it.
- Accepted desk mutations remain within the supported full-backup capacity.
- Schema-2 local desks and private backups, with atomic migration of schema-1
  saved desks and restoration of both backup versions. Public mailbags stay
  version 1. Existing messages are treated as read during migration.
- Unread markers, new-reply detection, native filters, bookmarks, reversible
  archive, followed threads, and a private draft shelf.
- Coalesced guarded draft saves avoid full graph validation on every input.
  Unsaved text remains available for retry, full backup, or private rescue.
- Backup-download status says when a download started without claiming that
  a file was retained. Restore/reset adopt the replacement revision only
  after the replacement save succeeds.
- Mail Call arrival summary and focused reader, local recent arrivals,
  highlighted receipt marks, and a searchable postmark album.
- Public-only printable keepsakes retain every known path separately, with
  readable print styling and no private desk metadata.
- Updated app-shell caching, responsive styles, keyboard focus recovery,
  sample/privacy notes, and the reproducible 27-check browser suite.

At this candidate's delivery, the dependency-free suites passed 58 checks
covering protocol/model logic and simulated storage, worker, and experience
APIs. Actual browser acceptance was then pending. The subsequent v1.2.0
entry records its promotion after user confirmation.

## 1.0.0-rc.1

First reviewable release candidate:

- Empty local mail desk, public postcards/replies, thread selection, exact
  packing manifests, preview-and-accept imports, and an isolated practice run.
- Stable message/parent IDs; early replies reconnect without being discarded.
- Ordered copy paths with participant stamps; forks and later direct arrivals
  remain distinct. Reopening a bag is an idempotent operation.
- Strict v1 JSON validation and atomic public state changes.
- Private draft autosave, atomic IndexedDB writes, full-desk backup/restore,
  concurrent-tab protection, and explicit save failure recovery.
- Day, night, high contrast, keyboard controls, responsive mail reading.
- Complete offline asset cache with readiness checks and connected repair.
- No runtime dependencies, account system, telemetry, or transport server.
- Editable source, fictional sample bag, format/hosting notes, protocol and
  offline-shell checks, and a reproducible browser acceptance suite.

At this candidate's delivery, actual desktop/mobile browser acceptance was
pending because the build environment blocked browser launch. Its candidate
label reflected that limit. `docs/VALIDATION.md` retains the historical result
alongside subsequent acceptance evidence.
