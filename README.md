# Sneakernet Social Club

**Green Shoe Garage Field Instrument · v1.5.0-rc.1**

A bulletin board whose messages travel in people's pockets. Write a public
postcard, choose the threads you are willing to carry, review the exact
contents, and download a JSON mailbag. Someone else opens the file later,
offline. Turn a postcard over to see the recorded paths its copies took.

**Release status:** v1.5.0-rc.1 adds first-unread navigation, automatic resume
at a saved postcard, 12-postcard reading sections, and parent/reply navigation.
Reading positions stay private. The carrier tools, larger-desk controls, and
release-bound offline files remain included. The current 41-check browser
suite is prepared but was not run here; the earlier user-reported v1.2 browser
pass is preserved separately.
See [the validation record](docs/VALIDATION.md) for current executed checks
and browser coverage.

## GitHub project and ready-to-upload web folder

This ZIP contains the complete repository and a generated **`web/`** directory.
Use the entire extracted project for GitHub. For static hosting, upload only
**the contents of `web/`**, preserving its `src/` and `assets/` subfolders.
No build or package installation is needed on the web server.

Start with [START-HERE.md](START-HERE.md) for the two layouts, deployment,
upgrade precautions, and rebuilding the deployment copy. Its runtime files
match the source exactly; this packaging update keeps app version 1.5.0-rc.1.
Run `npm run check:web` to verify that parity. The included acceptance workflow
also checks it.

## Open your desk

1. Extract this ZIP and open a terminal in `sneakernet-social-club`.
2. Run:

   ```sh
   python3 serve.py
   ```

3. Visit **http://127.0.0.1:8787/** in your browser.
4. Wait for **Offline ready**, then bookmark that exact address.

The Python server serves static application files only. There is no backend
or mail service. No package install or build command is needed to run the app.
Directly double-clicking `index.html` is not a supported setup; the app shows
launch instructions for that case.

For a phone or a shared setup address, upload the contents of `web/` to a static **HTTPS**
host. Everyone gets their own local desk. The app supports installation in a
subfolder, including a GitHub Pages repository path. Once the first setup
finishes, it is designed to reopen at that same address with the network
disconnected. Use the same browser profile; a different origin or folder is a
different desk. [Hosting and offline details](docs/OFFLINE.md).

## The first minute

- **Write a postcard** chooses a handle and an optional broad postmark, then
  opens the writing form. Drafts autosave locally. Posting adds public text to
  your desk; it does not send anything.
- **Open a mailbag** reads a selected JSON file, previews new posts, replies,
  already-seen messages, and arriving paths, then asks you to accept. **Mail
  call** offers a postcard-by-postcard reader. Use **Read arriving mail**
  when offered after accepting to enter Mail Call.
- **Try a delivery** walks a fictional request out and a reply home in a
  separate, temporary practice desk. It never changes your board.

## Pass it along

1. Check **Carry this thread** for the conversations you want to carry, or
   choose them after pressing **Pack mailbag**.
2. Review every message, handle, postmark, path, and reported time. Larger
   manifests have 12 postcards per page; use Next to inspect every page.
   The exact complete JSON is available below the readable manifest.
3. Choose **Download mailbag**.
4. Move that file by USB, an OS file-sharing feature, or any ordinary transfer.
5. The other person uses **Open a mailbag** and accepts it when ready.

There are no accounts, central server, relay, telemetry, remote fonts, or
simultaneous-connection requirements. The app uses one exchange method:
portable, versioned JSON files.

## What stays private, and what travels

| Data | Public mailbag | Full-desk backup |
| --- | --- | --- |
| Selected public messages and known replies | Yes | All desk mail |
| Stable message IDs and parent links | Yes | Yes |
| Participant-supplied handles, optional postmarks, random station IDs, reported times | Yes, for the selected mail's paths | Yes |
| Private postcard/reply drafts | No | Yes |
| Current local station preferences | Only stamps explicitly attached to outgoing mail | Yes |
| Theme, carry selections, opened-bag receipts | No | Yes |
| Read/unread markers, saved reading positions, followed threads, bookmarks, archive | No | Yes |
| Recent-arrival history and last backup-download time | No | Yes |
| Outbox packing receipts | No | Yes |

User mail is in the browser's IndexedDB storage, separate from app files.
Exports are ordinary files chosen by the user. Keep them outside the source
repository. `.gitignore` excludes the app's normal export filenames.

Postmarks are participant claims. They are not verified locations or digital
signatures. Files are public plain text, not encrypted. The app never asks for
GPS and has no latitude/longitude fields. Use broad places or club names;
leave precise addresses and coordinates out of volunteered text.

## Threads and postcard backs

Messages have random stable IDs and replies have parent IDs. If a reply
arrives first, it is retained and can itself travel; it reconnects when its
parent arrives. Reopening the same bag adds no message or postmark duplicates.
An unreadable, unsupported, or conflicting bag is rejected before modifying
the desk.

Each postcard has one or more complete known paths. A path records written,
packed, and received marks in causal sequence. Reported timestamps are shown
but never used to rearrange those marks. Two different routes remain two
different paths, including a later direct delivery after an indirect one.

The protocol is documented in [MAILBAG-FORMAT.md](docs/MAILBAG-FORMAT.md).

## Carry it again

**Outbox** records bags packed on this desk. Open a **packing receipt** to
see the original messages, handles, postmarks, and separate known paths.
Later replies and station changes do not alter an older receipt.

| Action | Result |
| --- | --- |
| **Download same bag** | Recreates the exact original JSON and filename, with the same bag ID. No new packed stamp or outbox record is added. A recipient that already accepted this bag adds nothing on reopening it. |
| **Pack current threads** | Selects the current complete conversations associated with that receipt and opens the ordinary packing review. Newly known replies and paths can travel in a new bag with new packed stamps. |

The packing chooser labels each thread **No saved packing receipt**,
**Same mail and paths as last packing**, or shows the number of new postcards
and new/extended paths. **Select new or changed threads** selects those
whose current contents differ from their last recorded packing. Review the
selection and full manifest before downloading.

Packing choices have 12 threads per page and search across the whole desk.
Individual selections survive page and search changes. Bulk selection and
Clear selection apply to every thread, including hidden search results.
The selection count always describes the whole outgoing choice.

The outbox follows packing order, even when the station clock moves
backwards. It supports search and keeps up to 100 receipts within a budget of
20,000 ID references. Old receipts may age out; public postcards and their
paths remain. Keep downloaded files if you need a permanent archive of every
outgoing envelope. A packing receipt does not confirm that a browser saved
the download or that someone transferred or delivered it.

Receipts use references to immutable messages and original packed-path ends,
so a full copy of every bag is not stored repeatedly. The public messages and
paths are still available on the desk. A restored full backup can therefore
reconstruct every retained receipt's original bag without contacting a server.

## A desk for returning conversations

Use **Show threads** to find unread mail, new replies, your original postcards,
mail you are carrying, early replies, bookmarks, or archived conversations.
**New replies** finds unread replies to conversations you wrote in or chose
to follow. It uses the original station identity; a matching handle alone
does not make a postcard yours. Archive is reversible and does not delete mail
or stop a selected thread from being carried. **All mail** includes archive.

The bulletin board shows 12 threads per page. Search and filters cover the
whole desk, including threads on other pages. Turning a page does not mark
messages read or change which threads you carry.

Open a thread to resume at its saved postcard. With no saved place, it opens
at the first unread postcard, or the first postcard if everything is read.
The reader shows at most 12 postcards in a section; **Previous postcards**
and **Next postcards** reach the rest. **First unread** jumps directly to the
next unread postcard in the conversation's parent-before-reply order.

Only the section you explicitly open is marked read. **Mark all as read**
and **Mark all as unread** are separate actions for the entire thread,
including other sections. Import previews, Mail Call's bag summary, search,
and automatic desk previews do not mark mail read. A new path for an
already-read postcard is recorded without resetting that message's marker.

On a reply, **View postcard** opens its parent, including a parent in another
section; **Return to reply** brings you back. The saved place follows a stable
message ID, so it survives reopening offline, full backup/restore, and a late
parent reconnecting the thread. Parent-return history lasts for the current
reading session. Reading places never travel in public mailbags.

**Private drafts** returns you to unfinished postcards and replies. Typing is
coalesced into small guarded draft saves; a failed save retains the text in
the open tab and offers retry and a private rescue download. Wait for
**Saved on this device** before closing the app.

**Recent arrivals** revisits up to 100 recent bag openings within a bounded
local history budget. Repeating an accepted bag adds no new arrival. Old mail
and its paths remain even when an old history entry ages out. **Postmark
album** collects actual station labels from known paths and opens related
postcards. It makes no map or location inference.

**Print keepsake** prepares a document containing the selected thread's public
messages and separate recorded paths. Its print layout omits private drafts,
read markers, bookmarks, and settings. Native printing and PDF output
coverage was not specified in the browser acceptance report; the validation
record keeps those details separate.

## Back up and restore

Use **Desk tools → Back up full desk** to download all mail, paths, drafts,
settings, reading state, bookmarks, archive, arrivals, outbox, station identity, and
replay receipts. Backups are private and are
separate from public mailbags.

**Desk tools → Restore full desk** previews the backup, offers to back up the
current desk, and requires an explicit replacement choice. A backup restores
one station's identity. To set up independent participants, start fresh desks
instead of cloning one backup into several browsers.

The desk shows when a **backup download started**. It cannot confirm that the
browser saved the file or that you kept it. Keep your backups outside the
application folder and repository.

### Upgrade an existing desk

Version 1.5 uses private desk schema **4** and full-backup version **4** to
store saved reading positions. Keep the same hosting address and folder.
The app atomically migrates schemas 1, 2, and 3, preserving existing IDs,
paths, drafts, preferences, carry choices, and opened-bag receipts. Existing
read markers, flags, arrivals, backup status, and schema-3 outbox receipts
remain intact. Reading positions start empty on older desks; migration does
not guess where you stopped reading. Only the original schema-1 migration
treats existing mail as read.

When upgrading schema 1 or 2, the outbox starts empty because those releases
did not retain original bag IDs. Schema-3 receipts remain able to reconstruct
their original files exactly. Full-backup versions **1–4** can be restored;
new backups use version 4. Public mailbags remain **version 1** and exchange
with v1.2, v1.3, and v1.4 in the actual prior-code compatibility checks.

**Keep a full backup made by your old version before upgrading if you may
need to roll back.** Apps through v1.4 reject a schema-4 desk or version-4
private backup; use the retained older backup with the older app.

### Understand capacity

**Desk tools → Desk capacity** shows saved postcards, distinct copy paths,
postmarks across paths, the longest path, opened-bag records, and the exact
UTF-8 full-backup allowance. The section opens automatically when a value
reaches 80% of its supported limit. These counts are app limits, not an
estimate of the device's free storage.

Limits remain 2,000 postcards, 4,000 paths, 20,000 path steps, 512 steps in one
path, 20,000 opened-bag records, 5 MiB per public bag, and 20 MiB per full
backup. Shared sections of separate paths count in each path. The backup
allowance reserves timestamps so a future backup can still fit.

Archive keeps the mail and does not free capacity. Preserve a full backup
before starting a separate desk for additional mail. The app refuses an
operation that exceeds its limits before committing; it does not shorten
postcard journeys to make room.

## Color and keyboard controls

Use the **Day**, **Night**, or **High contrast** option in the header. Native
buttons and dialogs support keyboard operation; use Tab, Enter, Space, and
Escape. Ctrl / Command + Enter posts from the writing form. Escape and
**Keep as draft** retain private draft text.

## Source layout

| File or folder | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `assets/` | Runnable responsive mail desk and original local icons |
| `web/` | Generated deployment copy: upload its contents to a static HTTPS app folder |
| `START-HERE.md` | GitHub, deployment, and regeneration instructions |
| `src/app.js` | Interface, forms, preview/accept flow, practice delivery, recovery |
| `src/core.js` | Pure versioned protocol, thread grouping, path merge, validation |
| `src/experience.js` | Mail Call, arrival history, postmark album, public keepsake document |
| `src/carrier.js` | Private outbox, original packing receipts, repeat-carry actions |
| `src/desk-view.js` | Shared bounded paging for boards, packing choices, and manifests |
| `src/reader.js` | Bounded conversation sections, unread/parent navigation, and focus targets |
| `src/storage.js` | Atomic IndexedDB snapshot and concurrent-tab protection |
| `src/launch.js` | Clear instructions for unsupported direct file launches |
| `sw.js`, `manifest.webmanifest` | Offline app shell and installation metadata |
| `examples/sample-mailbag.json` | Deliberately imported fictional sample |
| `serve.py` | Optional localhost static server |
| `tests/` | Protocol, offline-shell simulation, and browser acceptance checks |
| `scripts/refresh-shell-integrity.mjs` | Refresh/check offline release checksums after source edits |
| `scripts/package-web.mjs` | Generate and verify the ready-to-upload deployment directory |
| `scripts/check-performance.py` | Reproduce timings against a kept previous-release ZIP |
| `docs/VALIDATION.md` | Actual results and unexecuted browser/device paths |
| `docs/PERFORMANCE.md` | Measurements, methodology, and remaining performance limits |

The source is the runnable app; there is no compiled bundle to recover or
separate build output to edit. MIT licensed.

After changing runtime source, update the release version in `package.json`,
`src/core.js`, `index.html`, and `sw.js`, then run:

```sh
npm run refresh:offline
npm run check:offline
npm run build:web
npm run check:web
```

Publish the complete contents of `web/`. These offline checksums prevent one release's
worker from filling its cache with another release's files. Do not enable
hosting transformations that rewrite the HTML, CSS, or JavaScript bytes.
The delivered package already has matching checksums; no build is needed
for ordinary hosting.

## Run the checks

With Node 22 or newer, the dependency-free checks run with:

```sh
npm test
```

The browser acceptance suite is separate and requires Playwright plus its
Chromium browser:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

That prepared suite has 41 checks in 16 isolated contexts. It performs normal UI imports and actual
downloads while offline, restores a backup, and records desktop/mobile
emulation results and screenshots. It never treats a launch failure as a pass.
It uses fictional mail only. GitHub Actions is configured to run it on pushes
and pull requests once this source is in your repository.

To check the current public protocol against the actual code from kept
release ZIPs, run:

```sh
python3 scripts/check-previous-release.py /path/to/Sneakernet-Social-Club-v1.2.0.zip /path/to/Sneakernet-Social-Club-v1.3.0-rc.1.zip /path/to/Sneakernet-Social-Club-v1.4.0-rc.1.zip
```

That is an in-memory Node compatibility check, separate from the browser
suite. It exercises both directions of the exchange, exact repeat delivery,
and migration of a backup created by the previous release. The packaged
v1.5 result records 27 passed checks, including safe rejection of the new
private backup by each older app.

To reproduce the current v1.4/v1.5 model comparison:

```sh
python3 scripts/check-performance.py /path/to/Sneakernet-Social-Club-v1.4.0-rc.1.zip
```

The fictional fixtures are generated only for the checks; they are never
loaded into the working mail desk. Results contain five raw samples per
operation and median timings. They do not measure browser or phone speed.

Physical-device USB, AirDrop, Android file sharing, and iOS file-picker
coverage was not specified in the acceptance report. The manual checklist
can record those paths when exercised; desktop emulation cannot certify
those OS interactions.

[Development status and remaining roadmap](docs/ROADMAP.md).
