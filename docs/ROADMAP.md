# Development roadmap

Current delivery: **v1.5.0-rc.1**. The reading-improvements batch is implemented.
The current browser suite is prepared but not run here; Mike's accepted v1.2
baseline remains separate historical evidence.

| Milestone | Status | Outcome |
| --- | --- | --- |
| Initial stabilization | Included | Exact export bounds, atomic replacement, private draft saves, migration and recovery |
| v1.2 baseline acceptance | Passed, user reported | Original exchange and everyday desk accepted; detailed device matrix not supplied |
| Everyday desk and Mail Call | Included | Unread/new replies, filters, drafts, bookmarks, archive, arrival reader, postmark album and public keepsakes |
| v1.3 carrier tools | Included; later browser acceptance pending | Outbox, exact original-bag downloads, receipts and changed-thread choices |
| v1.4 long-lived desks | Included; measured Node behavior | Shared lookups, bounded lists, visible capacity and release-bound offline files |
| v1.5 reading improvements | Implemented; release candidate | First unread, automatic saved-place resume, 12-card sections, parent/return navigation and private schema-4 backups |

## Completed v1.5 decisions

Keep the reading place as a stable message ID. A late parent or newly received
branch can change a postcard's section without invalidating that anchor.
Opening a section marks only its exposed postcards read. Whole-thread Mark all
remains explicit, and automatic previews do not consume unread mail.

Saved positions belong to the private desk and full backup. Public mailbags
stay version 1. Schemas 1–3 migrate to 4 without guessing an old reading place;
prior outbox files remain exact. Older apps reject the new private backup, so
keep a backup made by the old version when rollback may be needed.

The new reader uses 12-card sections and parent/return controls. The existing
snapshot storage, shared indexes, protocol limits, and copy-path model remain.
Fresh Node measurements against v1.4 show mixed changes and do not measure
browser or phone responsiveness. Historical v1.4 optimization results remain
available separately.

See [VALIDATION.md](VALIDATION.md), [PERFORMANCE.md](PERFORMANCE.md), and
[MANUAL-CHECKS.md](MANUAL-CHECKS.md) for evidence and remaining paths.

## Next: acceptance and field use

1. Run the current **41-check** normal-control browser suite. It uses **16
   isolated contexts**, actual offline file exports/imports, and prepared
   desktop keyboard plus 320px/390px touch paths.
2. Exercise the intended phone file picker and transfer route, and a hosted
   update of an existing desk. Record browser, OS, device, and actual outcomes.
3. Fix observed regressions, repeat the affected checks, then promote the
   candidate. The v1.2 user acceptance does not certify these later changes.
4. Carry a conversation at a real meetup and prioritize maintenance from
   observed friction.

The next work is acceptance and field feedback. Further rendering work,
background processing, larger limits, and additional transports need measured
use before commitment.

## Scope guardrails

Keep the club centered on public text, selected conversations, inspectable
copy paths, and ordinary files. Preserve private drafts, reading places and
preferences, independent paths, offline access, and complete backups. Another
transport, account system, attachment type, or location feature is outside
this batch.
