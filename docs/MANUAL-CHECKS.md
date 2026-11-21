# Real browser and device acceptance

The user reported **browser acceptance passed** for the v1.2 baseline.
This reusable checklist is not an itemized record of that run: browser/OS
versions, individual cases, viewport details, physical-device paths, and
native-print coverage were not supplied. New v1.3, v1.4, and v1.5 checks appear
below and have separate results in `VALIDATION.md`.

## v1.5 reading and saved-place checks

1. On a disposable source desk, write a root postcard and 26 replies through
   the normal controls. Pack the conversation and save the actual file.
   After both desks are offline-ready, disconnect the network and open that
   exported bag on a separate fresh recipient. All 27 cards must arrive in
   one thread; the automatic preview must leave them unread.
2. Use **Mark all as read**, then **Mark all as unread**. Each action must
   affect all 27 postcards, including other sections, without creating a
   reading position. Explicitly open the thread; only its first 12 cards
   should become read. Confirm the remaining 15 stay unread.
3. Choose **First unread**. It should show postcards 13–24 and save the
   exact target message. Back up the full desk, close the app, and reopen
   offline. It must return to that postcard without reading the last three.
4. Choose **First unread** again to reach the last section. From a reply,
   choose **View postcard** to open its parent, then **Return to reply**.
   Check exact message targets across sections. Try a reply-to-reply chain
   and repeated parent/return navigation as well as Previous/Next.
5. Restore the middle-section backup into a disposable recovery desk. Check
   the saved target and unread counts. Pack its mail and inspect the JSON:
   `readingPositions` and other private reading state must be absent. Repeat
   an imported bag and confirm anchors, mail, and postmarks are unchanged.
6. Follow the early-reply fixture instructions below, read an orphan, and
   keep its full backup. Deliver its parent later and reopen offline. The
   saved place must remain that exact reply even if its section changes;
   newly arrived neighboring messages remain unread until explicitly opened.
7. Restore a v1.4/schema-3 backup. Existing state and original Outbox files
   must survive; reading positions start empty. Keep a pre-upgrade backup
   for rollback. In a disposable older app, a v4 private backup must be
   rejected without replacing the existing desk.
8. Repeat section, unread, parent/return, and offline-resume controls at
   320px and 390px, in all three color modes and by keyboard. Check that focus
   reaches the target and stays where the user moves it after a slow save.
   Record actual phone file-picker and transfer paths separately.
9. Use two tabs of a disposable desk to cause the existing stale-tab save
   warning. Reading in the stale tab should remain usable and explain that
   read markers and the saved place were not persisted. Do not count an
   error state as a successful saved-place check.

## v1.4 larger-desk and upgrade checks

1. On a disposable source desk, write at least 27 public postcards through
   the normal writing form. Keep a private draft. Use a different, freshly
   initialized desk as the recipient; wait for offline readiness on both,
   disconnect the network, and stop the static host.
2. Open **Pack mailbag**. Check the 12-thread pages, search for a thread on
   another page, and select several threads across pages and search results.
   Clearing search must retain those choices. Bulk changed-thread selection
   must cover all 27 threads, including hidden rows; its count must say 27.
3. Review every page of the manifest and its complete JSON. Export the actual
   bag and open that file using the recipient's normal **Open a mailbag**
   control. Verify all 27 messages, their handles, and separate paths before
   accepting. The private draft must be absent.
4. On the recipient, visit all three board pages, search for a hidden thread,
   and select carry choices on different pages. Changing page/search must
   not silently mark unread mail read or drop selections. Reopen offline and
   check the saved choices. Inspect keyboard focus after Previous/Next.
5. Open **Desk tools → Desk capacity**. Check counts against a full backup,
   including UTF-8 byte size and reserved timestamps. Restore that downloaded
   backup into a disposable desk and repeat the bag import; mail and paths
   must remain unchanged. Check existing outbox files remain exact after a
   v1.3 backup restore and subsequent packing.
6. Open an already-read postcard's back on the main desk. Open that card in
   Mail Call; it starts on the front. Return using Close, then repeat using
   **Read the whole thread**. The main back must remain, and one activation
   of **Back to message** must show its front.
7. Repeat paging, hidden-thread search, packing and capacity inspection at
   320px and 390px widths, in day/night/high contrast and by keyboard. Record
   physical-phone file-picker/share tests separately from emulation.
8. For a disposable hosted installation, install this complete release,
   preserve a full backup, and test a later release with a different visible
   version and refreshed checksums. Publish only part of it first: the new
   worker must not replace the complete old shell. Finish deployment, reload,
   wait for offline readiness, then disconnect and reopen. Record actual
   browser/version and outcome; simulated worker checks alone do not certify
   this upgrade path.

## v1.3 carrier checks

1. Upgrade a v1.2 desk or restore its full backup. Confirm existing mail,
   paths, drafts, reading markers, flags, arrivals, station, selections, and
   backup status survive. The new **Outbox** is empty until a new bag is
   packed; older paths must not be presented as invented bag receipts.
2. Pack a thread through the ordinary chooser and manifest review. Save the
   downloaded file. Open Outbox and its packing receipt; confirm the original
   body text, handles, paths, bag ID, and raw JSON match the file.
3. Choose **Download same bag**. Compare bytes and filename with the first
   download. No stamp, message, or outbox receipt should be added. Accept
   both copies at another desk; the second import must be a strict no-op.
4. Receive a new reply or path at the sender. The chooser should identify
   changed mail relative to its last recorded packing. The original receipt
   and its re-download must remain unchanged.
5. Use **Pack current threads** from that old receipt. Review the current
   complete thread, then download. It should have a new bag ID and new
   packed stamps, including newly known replies and paths.
6. Restore a current full backup into a disposable desk. Its retained outbox
   must still reproduce the original bags. Public mailbags must exclude
   outbox records and other private preferences/drafts.
7. On the intended desktop and phone paths, check search, pagination,
   receipt scrolling, visible keyboard focus, long text, the repeat-download
   action, and repacking controls in all three color modes.

## Three independent desks

Use three fresh browser profiles, or three separate browser applications.
Three ordinary tabs at the same app address share a desk and are not three
participants. Alternatively, host separate copies in `/a/`, `/b/`, and `/c/`;
the app scopes storage and its offline worker to each installation folder.
Never create participants by restoring the same full-desk backup.

1. Open each installation once with the host reachable. Confirm the board is
   empty and the status becomes **Offline ready**.
2. On A, set handle `Mike` and postmark `Cumberland Maker Meetup`. On B, use
   `Morgan` and `Hamfest swap table`. On C, use `Jules` and `DEF CON`.
3. Disconnect the network (and stop a localhost file server, if used).
   Close and reopen each app at its bookmarked address. Verify that the
   desk, handle, and controls appear.
4. On A, write `Who's got a spare rotary encoder?` and post it. Write a
   separate private draft, then close its dialog.
5. Select the thread, choose **Pack mailbag**, review the complete manifest,
   and download the file. Confirm that the private draft is absent.
6. Transfer that downloaded file to B. **Open a mailbag**, inspect the new
   post preview, leave it unopened once, and check that B's board is still
   empty. Open it again and accept.
7. B packs and downloads the thread. Transfer that actual file to C, and
   accept it there.
8. C writes a reply, packs the thread, and passes its downloaded bag to B.
   B accepts, packs again, and returns that downloaded file to A.
9. A should see one thread with two postcards. Turn the original over: its
   known path should show A written/packed, B received/packed,
   C received/packed, B received/packed, A received. The reply's own path
   starts at C and returns through B to A.
10. Open the last B→A bag twice more. Postcards and postmarks must be
    unchanged. Export backups before/after and compare their `desk` values
    if an exact check is needed; `exportedAt` and the private
    `desk.local.lastBackupAt` naturally differ after another backup download.

## Everyday desk and Mail Call

1. Accept a new bag. Its Mail Call summary must preserve unread markers.
   **Start reading** marks only the displayed postcard; a new reply appears
   before a returning known parent. Turn a card over to inspect highlighted
   receipt stamps. Reopening the bag must not add another recent arrival.
2. Try Unread, New replies, My postcards, Carrying, Waiting for parent,
   Bookmarked, Archived, and All mail. A same-spelled handle from an
   independent station must not make its postcard yours.
3. Bookmark, follow, archive, and return a thread to the desk. Restore a full
   backup and confirm those choices. Pack it and confirm none of the private
   choices travels in the public JSON.
4. Type quickly, keep a draft, open **Private drafts**, and resume its exact
   text. Close with Escape, wait for saved status, then reload and resume it.
   Check a reply draft as well. A failed save must retain text and provide a
   private rescue download; it must not quietly report saved.
5. Open the postmark album, search a supplied label, and open a related
   postcard. Labels come from recorded paths; no location verification is
   implied.
6. Preview a printable keepsake. Check message fronts and separate known
   paths on the backs. Open native print preview or save as PDF; inspect
   pagination, long text, all branches, and absence of private desk data.
   Record native printing as exercised only if this step actually ran.
7. Make a full backup. The status must say **Backup download started**, not
   that the browser confirmed a file was saved. Restore an original v1
   backup and check that legacy mail is read and all old IDs/paths survive.

## Alternate paths and early replies

- Deliver A's original outgoing bag directly to C after C already received
  it through B. C should retain both A→B→C and A→C as separate paths, even
  though the postcard text and ID are the same.
- To check two returning branches, have a fresh D open A's first bag, pack
  it, and return it to A. A should retain the B/C route and D route separately.
- Follow `examples/README.md` to seed a reply-only sender, use normal controls
  to export its orphan thread, and deliver that actual export before its
  parent. Deliver the parent later and verify automatic reconnection.

## Restore and failure recovery

1. On A, keep a private postcard draft and reply draft, choose a color mode,
   and select a thread to carry.
2. **Desk tools → Back up full desk**. Restore it into a separate disposable
   recovery profile, explicitly confirming replacement.
3. Check messages, paths, handle, postmark, drafts, carry choices, and theme.
   Reopening a bag already present in the backup must add no extra stamp.
4. Open truncated JSON, a plain text file, and an unsupported version through
   **Open a mailbag**. Check for an error and an unchanged desk. A full-desk
   backup selected as a mailbag must be identified as the wrong file type.
5. Keep a private draft, reload, and confirm its text is still present.
6. Open the same desk in two tabs. Save in one, then try saving in the other.
   The stale tab must preserve its work and show a backup/reload warning
   instead of overwriting the newer saved desk.

## Desktop and phones

Run the main flow in day, night, and high contrast. Check 320px and 390px
phone widths and a normal desktop window, including the longest handle,
postmark, and 2,000-character message. Verify no horizontal clipping, reachable
dialog actions, usable postcard backs, and readable keyboard focus.

Use only the keyboard for station setup, writing, keeping a draft, reopening
it, posting with Ctrl/Command+Enter, selecting a thread with Space, opening
and closing dialogs with Enter/Escape, and turning a postcard over.

On actual Android and iOS devices, separately record:

- Browser/OS version and whether using a browser tab or installed shortcut.
- First HTTPS setup and offline reopen after closing the app.
- Saving a downloaded JSON file, finding it in the OS file picker, accepting
  it, and forwarding a newly packed file.
- The chosen transfer route (USB, OS sharing, or another file transfer).
- Full-desk backup restore on the intended browser/shortcut.

Record these results as actual device tests. Emulation does not substitute
for OS-level sharing, USB, or file-picker behavior.
