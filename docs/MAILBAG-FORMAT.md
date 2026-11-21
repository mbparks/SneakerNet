# Sneakernet Social Club: mailbag format v1

This document describes the unchanged v1 interchange protocol and private desk schema 4 in application v1.5.0-rc.1. The editable implementation is `src/core.js`; model checks include `tests/core.test.mjs`, `tests/desk-features.test.mjs`, `tests/carrier-model.test.mjs`, and `tests/reading-model.test.mjs`. Application version, public mailbag version, and private backup version are separate. Public mailbags still use **version 1**. Current full-desk backups use **version 4**, and versions 1, 2, and 3 remain readable through migration.

## Two different files

| File | Purpose | Contains |
| --- | --- | --- |
| Public mailbag | Carry selected conversations to another desk | Selected public messages, stable message and parent IDs, the known paths for those messages, volunteered handles and station postmarks, participant-reported times, random station and event IDs |
| Full-desk backup | Restore your own complete desk | All messages and paths, your station identity, private drafts, carrying choices, opened-bag receipts, theme preference, read markers, saved reading positions, bookmarks, archive and follow flags, recent arrival summaries, private outbox receipts, and last backup-download-start time |

A mailbag is **not encrypted, signed, authenticated, or addressed to a private recipient**. Anyone who receives the JSON can read it, copy it, change it, or pass it on. Handles are names participants provide, not verified accounts. Route stamps are participant-supplied claims about a copy. They are useful context, not proof of identity, attendance, physical travel, or delivery.

No location coordinates, GPS readings, contact lists, device descriptions, or network addresses are part of the schema. The app does not request geolocation. An optional postmark is ordinary volunteered text such as “Cumberland Maker Meetup”; use a broad station or event name. Text that a person deliberately types into a message or a postmark is public when carried.

## Envelope

Every required field must be present. Unexpected fields are rejected, so hidden metadata cannot be silently relayed. Unsupported versions are rejected before changing the desk.

```json
{
  "format": "sneakernet-social-club/mailbag",
  "version": 1,
  "id": "bag_<UUID>",
  "packedAt": "2026-11-21T12:00:00.000Z",
  "messages": [],
  "routes": []
}
```

The shortened IDs above are illustrative. Actual IDs use the indicated prefix followed by a lowercase UUID in its full `8-4-4-4-12` spelling. New IDs are generated with the browser’s cryptographic randomness. They do not contain time or location.

A nonempty bag contains at least one message. A parent message may be absent. Every included message must have at least one route, and every route must refer to an included message. A bag can contain several independent threads, and several known paths for one message.

The exported file is compact JSON followed by one newline. `serializeMailbag(bag)` validates and measures the **exact UTF-8 bytes it returns**, including that newline, against the 5 MiB input cap. Object keys are serialized in sorted order; normalized message and route arrays retain their canonical order, and each path remains in its recorded event order. This deterministic serialization lets an outbox receipt rebuild an identical exported file even after a backup changes object-key order. The packing operation checks the same byte count before returning a candidate desk. The packing preview's raw JSON shows this exact serialization. The imported-record disclosure may indent the same data for reading. Another implementation may use whitespace or a different object-key order, provided its actual input file remains within the limit. A differently formatted file can still refer to the same accepted envelope.

## Messages

```json
{
  "id": "msg_<UUID>",
  "parentId": null,
  "handle": "Mike",
  "body": "Who’s got a spare rotary encoder?",
  "createdAt": "2026-11-21T12:00:00.000Z"
}
```

A new thread has `parentId: null`. A reply has the stable ID of the message being answered. A reply can answer the thread root or another reply.

Once a message is public, its ID, parent, handle, body, and reported creation time are immutable. A file claiming an existing ID with different content is rejected as a whole. IDs are not content hashes; two people independently writing identical text create two distinct messages.

If a reply arrives before its parent, it is retained. The missing ancestor’s ID identifies the provisional thread. When that ancestor arrives, parentage reconnects the messages without recreating their IDs or postmarks. Parentage also controls message display order. Neither message grouping nor handoff order relies on the station clocks agreeing. Circular parent chains are invalid, including a cycle that appears only when incoming and existing messages are combined.

## Known paths and postmarks

```json
{
  "messageId": "msg_<UUID>",
  "path": [
    {
      "id": "mark_<UUID>",
      "stationId": "station_<UUID>",
      "handle": "Mike",
      "postmark": "Cumberland Maker Meetup",
      "kind": "written",
      "at": "2026-11-21T12:00:00.000Z"
    }
  ]
}
```

`path` is an ordered array. Its order records the claimed sequence; timestamps are displayed as reported and never used to reorder it.

| Kind | Meaning |
| --- | --- |
| `written` | The initial stamp created with the message |
| `packed` | This desk put this known copy into an outgoing bag |
| `received` | This desk accepted this incoming copy |

The first stamp must be `written` and agree with the message’s handle and creation time. A route has only one origin. All paths for a message must share that same origin ID. Handles and optional station labels are copied into individual events, so changing the current station name does not rewrite old stamps.

Packing extends **each** selected known path with its own `packed` event. First acceptance of a bag extends every offered path with a `received` event. The preview’s new-path count is the number of receipt paths that accepting this envelope will add; already-known message content is counted separately. A receiver does not claim a physical USB transfer or a particular transport; it only records accepting the file at that desk. Stamps are recorded separately for each message, including replies.

Known paths merge by exact event IDs. Repeating an exact path does not duplicate it. If one path is an exact prefix of a longer known path, the longer path contains the earlier history and replaces the short prefix in the stored path list. Distinct branches remain separate. For example, `A → B → D` and `A → C → D` are retained as two paths, never combined into `A → B → C → D`.

The same stamp ID must always have identical contents, refer to the same message, and have the same predecessor ID. This check prevents accidental collision and obvious splicing of known events. It does **not** turn unsigned participant claims into authenticated evidence.

## Duplicate and conflict handling

For each accepted bag, the desk privately remembers its bag ID and a SHA-256 fingerprint of the validated, normalized public contents. The digest is a local replay check, not a sender signature. JSON indentation and object property order do not matter; array order inside a path does matter.

Opening an already accepted bag produces an already-opened preview. Accepting it again returns the desk unchanged: no duplicate messages, no added postmarks, and no new routes. The receipts survive a full-desk backup and restore.

If the same bag ID returns with different contents, the whole bag is rejected. Ask its sender to create a new bag. First acceptance of a different bag records its offered copies as received, even when their earlier histories are already known exactly or as prefixes. For example, C can first receive `A → B → C` and later accept A’s original bag directly; the separate `A → C` path must survive. Reopening that original bag after its first acceptance at C remains a strict no-op. These receipt events are participant claims about accepting different files, not proof of distinct physical trips.

Imports are validated against both the file and the existing desk before a replacement state is returned. Broken JSON, unsupported formats, missing fields, unexpected fields, unsafe property names, inconsistent identities, invalid routes, cycles, and capacity limits produce an error. The pure engine never changes its input desk in place. The app commits the returned candidate through its local persistence layer.

## Practical limits

These are defensive bounds for a small, inspectable bulletin board, not a truncation policy. Exceeding a bound fails explicitly; no message or postmark is silently dropped.

| Item | Current limit |
| --- | --- |
| Message body or private draft | 2,000 UTF-16 code units, matching the browser form counter |
| Handle | 40 code units |
| Optional postmark | 80 code units |
| Mailbag input and exported text | 5 MiB of UTF-8 JSON, including any whitespace and final newline |
| Full-desk backup input and exported text | 20 MiB of UTF-8 JSON, including any whitespace and final newline |
| Messages per bag or desk | 2,000 |
| Maximal paths per bag or desk | 4,000 |
| Events in one path | 512 |
| Events counted across all stored paths | 20,000, including shared prefixes |
| Local opened-bag receipts | 20,000 |
| Retained local arrival summaries | Latest 100 accepted bags, further bounded by total references |
| References across retained arrival summaries | 20,000: each message ID counts once; each path receipt contains two counted IDs |
| Retained private outbox receipts | Latest 100 packed bags, further bounded by total references |
| References across retained outbox receipts | 20,000: each message ID counts once; each packed-path head contains two counted IDs |

Control characters are disallowed in handles and postmarks. Message bodies and private drafts permit ordinary line breaks and tabs. Message text remains plain text; it is never interpreted as HTML or executed as code.

Structural counts are not substitutes for byte limits: multibyte text and long histories can exhaust the backup cap before the message count is reached. Every candidate desk is also checked against the exact compact version-4 backup envelope, including its private reading positions. A fixed-width export timestamp and the first backup-start marker are reserved in that check. A write, import, packing operation, flag change, reading action, or draft save that would make the desk unbackupable fails before persistence. No message, route, draft, or replay receipt is discarded to make it fit. A legacy desk whose migration would exceed the cap is likewise left unchanged and reports the capacity error.

Recent arrival summaries and private outbox receipts have explicit recency policies. The app removes the oldest **whole entries** from the relevant list until its own count and reference limits hold; this does not remove messages, path events, or opened-bag replay receipts. One maximum-size accepted or packed bag fits within its corresponding reference bound by itself. An outbox entry that has aged out can no longer recreate its envelope, but its public postmarks remain in the known paths.

## Full-desk backup

```json
{
  "format": "sneakernet-social-club/desk",
  "version": 4,
  "exportedAt": "2026-11-21T12:00:00.000Z",
  "desk": {
    "schemaVersion": 4,
    "station": {"id": "station_<UUID>", "handle": "Mike", "postmark": "Cumberland Maker Meetup"},
    "messages": [],
    "routes": [],
    "seenBags": {},
    "drafts": {"post": "", "replies": {}},
    "selected": [],
    "preferences": {"theme": "day"},
    "local": {
      "readMessageIds": [],
      "bookmarkedThreadIds": [],
      "archivedThreadIds": [],
      "followedThreadIds": [],
      "lastBackupAt": null,
      "arrivals": [],
      "outbox": [],
      "readingPositions": []
    }
  }
}
```

`seenBags` maps bag IDs to lowercase 64-character SHA-256 fingerprints. `drafts.replies` maps parent-message IDs to private draft text. `selected` contains the stable root or missing-ancestor IDs of threads chosen for carrying. Themes are `day`, `night`, and `contrast`.

A backup restores the original station identity as well as the data. Use it to recover your desk or move that desk to another browser. Start a fresh station for an independent participant. A backup is private desk material; use a public mailbag when passing conversations to another person.

`serializeBackup(desk)` takes a desk, validates it, wraps it as backup version 4, and returns the exact compact JSON plus newline checked against the input cap. `lastBackupAt` records when a backup **download was started**; the browser cannot confirm that a person retained the downloaded file. Creating or serializing a backup alone does not update this marker. The app prepares the marker separately with `markBackupStarted`, serializes before committing it, and starts the download.

## Private desk notes

These fields never appear in a public mailbag. No read markers, saved reading positions, archive choices, follow list, private arrival index, or outbox record is sent to another station.

| Field | Meaning |
| --- | --- |
| `readMessageIds` | Message IDs the local desk considers read |
| `bookmarkedThreadIds` | Current thread roots or missing-ancestor IDs bookmarked locally |
| `archivedThreadIds` | Threads placed in the local archive; messages and paths remain intact |
| `followedThreadIds` | Threads for which the desk explicitly watches new replies |
| `lastBackupAt` | UTC timestamp for the last started backup download, or `null` |
| `arrivals` | Bounded local summaries of accepted, previously unseen bags |
| `outbox` | Bounded local references to the exact public envelopes packed at this desk |
| `readingPositions` | Stable message IDs for saved reading places, at most one per current thread after normalization, in last-visited order |

Newly authored messages start read. New imported messages start unread. Receiving another path for an already-known message does not change its read marker. Read state uses IDs, never matching handle text. “Mine” means that the thread root's original written stamp has this desk's station ID. “New replies” means unread replies by other station IDs in a thread this desk has participated in, or explicitly follows. A local unread toggle on one's own reply does not count as a newly received reply.

Thread flags follow group membership. If an orphan thread was temporarily identified by a missing parent, and that parent later proves to be a reply in another thread, flags and carrying choices move to the resulting thread root. Distinct flags combine without altering any public message or path. The message IDs within read markers remain unchanged.

### Saved reading positions

`readingPositions` is an array of existing message IDs, oldest visit first and newest last. It stores no page number, pixel offset, clock, or location. Repeated IDs and references to absent messages are rejected. When a late parent joins provisional threads, normalization keeps the last appended anchor in the resulting conversation. It does not select a winner by a participant's timestamp.

`readingFacts(desk, thread, index?)` returns `firstUnreadId`, `resumeId`, and `unreadCount`. First unread follows the same parent-before-reply display order as the thread. A shared index must belong to the same desk snapshot.

`recordReading(desk, {messageIds, anchorId})` returns a detached candidate desk. Its nonempty, unrepeated message IDs must all exist in one current thread, and `anchorId` must be among them. It marks those messages read and replaces that thread's saved position atomically. It does not change public messages, paths, carrying choices, or outbox receipts.

The main reader exposes at most 12 postcards at once. Explicitly opening a thread, section, unread target, or parent records that exposed section; automatic previews and reopening the app do not. **Mark all as read** and **Mark all as unread** apply separately to every message in the thread without moving its reading position. Parent-return history is temporary interface state and is not part of the desk or backup. Full backups preserve saved positions; public mailbags exclude them.

An arrival has this exact shape:

```json
{
  "bagId": "bag_<UUID>",
  "receivedAt": "2026-11-21T12:00:00.000Z",
  "newMessageIds": ["msg_<UUID>"],
  "messageIds": ["msg_<UUID>"],
  "pathReceipts": [
    {"messageId": "msg_<UUID>", "markId": "mark_<UUID>"}
  ]
}
```

`messageIds` lists all messages offered by the bag, including known ones. `newMessageIds` contains the subset that was new to this desk. Each `pathReceipts` item points to the locally appended `received` mark for one offered path. The marker stays discoverable in descendant paths after later carrying. Summary validation checks the message, station ID, receipt kind, and recorded acceptance time against those retained events.

Arrivals are appended in **acceptance order**, oldest to newest. Clocks can disagree or move backwards; timestamps never reorder this list or its underlying paths. Previewing a bag does not create an arrival. Reopening an accepted bag does not create one either, including after its older convenience summary has aged out: the independent replay ledger is still retained.

## Private outbox and exact re-download

A packing receipt has this exact shape:

```json
{
  "bagId": "bag_<UUID>",
  "packedAt": "2026-11-21T12:00:00.000Z",
  "messageIds": ["msg_<UUID>"],
  "pathHeads": [
    {"messageId": "msg_<UUID>", "markId": "mark_<UUID>"}
  ]
}
```

The receipt stores references rather than another copy of the full public file. `messageIds` identifies the immutable messages in the original normalized bag order. Every `pathHeads` item identifies the terminal local `packed` event of one copy in that envelope, in normalized route order. The bag ID and packing time remain those of the original envelope.

`prepareMailbag` extends the selected known paths, creates an envelope, and adds its receipt only to the **detached candidate desk** it returns. Merely previewing or cancelling does not change the working desk. The app commits that candidate when the user chooses the download. The receipt means that this desk packed the bag; it is not confirmation that the browser retained a file, that someone transferred it, or that another station received it. Imported mailbags do not become outbox entries.

`rebuildMailbag(desk, bagId)` reads a retained receipt, looks up its immutable messages, and takes each known path only through the recorded packed head. Later replies and later stamps are excluded. If several newer branches contain an old packed prefix, the old prefix is rebuilt once. Rebuilding adds no marks, changes no private state, and uses the original bag ID. Deterministic serialization produces the same outgoing bytes, including after backup/restore. A recipient that already accepted that bag recognizes it as the same envelope and adds no duplicate receipt stamp.

The validator checks that every referenced message exists, message references are unique and canonically ordered, and each packed head belongs to its stated message and this desk's station ID. Its event kind and time must match the receipt. Every included message must have at least one included path. Duplicate bag IDs, repeated packed heads, noncanonical path order, a path included alongside its continuation, unsupported fields, and envelopes exceeding the public import limits are rejected. A packed-head ID belongs to one retained envelope; re-downloading an envelope does not create a second receipt. The validated immutable predecessor graph provides the path prefixes and their byte sizes without duplicating historical public data in storage.

These checks detect inconsistent or damaged records; an editable private backup is not a signed historical archive. The same trust limits apply as elsewhere in the application.

## Comparing a repeat packing

`packingFacts(desk, thread)` compares the current thread with its **latest retained packing receipt that includes any message in that thread**. Latest means append order, not the largest station timestamp. It returns:

```json
{
  "lastBagId": "bag_<UUID>",
  "lastPackedAt": "2026-11-21T12:00:00.000Z",
  "hasReceipt": true,
  "newMessageCount": 0,
  "newPathCount": 0,
  "hasChanges": false
}
```

`newMessageCount` counts current messages absent from that packing. `newPathCount` counts current complete paths whose terminal mark was not one of that receipt's heads: a newly received continuation therefore counts as a changed path, even when its old prefix was already carried. Private changes such as a bookmark, draft, or theme do not count. If an early-reply thread acquires its ancestors, its retained receipt is still found by message membership, and the newly joined messages and paths are reported against that receipt.

With no saved receipt, the IDs and time are `null`, `hasReceipt` is false, and all current messages and paths are counted as absent from the available record. That means **no saved packing receipt**, not proof that the conversation has never been carried. A merged thread can include messages carried in an older, separate bag; the comparison remains explicitly to the latest intersecting receipt. The UI distinguishes downloading the same old envelope from packing a new bag with current mail and new packed events.

## Migration from desk schemas 1, 2, and 3

Version 1 backups contain the legacy exact desk fields shown above except `local`, and use `schemaVersion: 1`. The loader validates those fields, preserves station identity, messages, paths, opened-bag receipts, private drafts, carrying selections, and theme, then returns schema 4. All existing message IDs become read; there is no trustworthy historical read state to reconstruct. Bookmarks, archive and follow lists start empty, `lastBackupAt` starts `null`, and arrivals, outbox receipts, and reading positions start empty. Migration does not invent old deliveries or change their postmarks.

Version 2 backups contain the exact legacy `local` fields through `arrivals`, without `outbox` or `readingPositions`. Migration retains their existing read markers, thread flags, backup timestamp, arrivals, and all other desk data, then adds empty outbox and reading-position arrays. Existing packed postmarks alone do not identify the old envelope IDs, so migration does not manufacture old outbox entries.

Version 3 backups include `outbox` but not `readingPositions`. Migration preserves their exact prior data, including retained original packing receipts, and adds `readingPositions: []`. No legacy migration guesses a reading position.

The backup envelope version must match its desk schema: 1 with 1, 2 with 2, 3 with 3, or 4 with 4. Unknown fields are rejected in every version. Successfully restored legacy desks subsequently export version 4 backups; public mailbags remain version 1. Apps through v1.4 reject schema-4 desks and version-4 backups. Keep a backup made by the old app before upgrading if rollback may be needed.

## Version evolution

Both formats have explicit numeric versions. This release reads and writes public mailbag version 1, writes private backup version 4, and reads private backup versions 1, 2, 3, and 4. It rejects future or unknown versions with a useful error and preserves the existing desk. A future incompatible format needs a documented migration or a new supported version. Random IDs and explicit parent IDs remain independent of the application's display version.
