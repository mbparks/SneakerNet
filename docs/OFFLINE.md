# Hosting and offline use — v1.5.0-rc.1

Sneakernet Social Club is a static application. There is no account system,
mail server, relay, analytics service, or runtime package install. Keep the
release folder together: its HTML, CSS, JavaScript, icon, manifest, and service
worker are the application. User mail is stored separately in this browser’s
IndexedDB storage and in files you explicitly download.

The delivery package includes a generated `web/` directory. Upload its
contents to the intended HTTPS app folder; the full repository, tests,
examples, and optional Python helper can stay off the public web server.
See [START-HERE.md](../START-HERE.md) for the package layout. On an existing
installation, keep the same URL folder: `web/` is the package's deployment
directory name, not a required addition to the app address.

## Start on one computer

1. Extract the release ZIP.
2. In the extracted `sneakernet-social-club` directory, run `python3 serve.py`.
3. Open `http://127.0.0.1:8787/` in a normal browser window.
4. Wait for the app’s offline-ready status before disconnecting the network.
5. Bookmark that exact address. Reopen it in the same browser profile.

Python 3 is needed only for this optional local file server. The application
has no Python backend. The server binds to this computer, not the local
network. An HTTPS deployment below is the simpler route for phones.

The browser can reopen a successfully cached app without the local file
server running. Keep the extracted files so you can run the server again if
the browser clears or evicts the app cache. Opening `index.html` directly with
a `file://` URL is not a supported setup: ES modules and service-worker
registration need an HTTP(S) origin. A direct file launch displays local-server
instructions instead of offering inactive mail controls.

## Host for everyone to set up their own desk

Upload the contents of `web/` to a static HTTPS host, including `sw.js` and
preserving its `src/` and `assets/` subdirectories. GitHub Pages works at a repository subpath: all runtime
URLs and the service-worker scope are relative to the installation folder.
No build command is required. Serve `.js` as JavaScript and
`.webmanifest` as `application/manifest+json`.

Each person visits the HTTPS address once and waits for offline readiness.
They can then reopen that address offline in the same browser/profile and
open downloaded mailbag files. If the browser offers installation or “Add to
Home Screen,” that can provide a convenient shortcut; ordinary browser use
does not require it. A home-screen shortcut and an ordinary browser tab may
use different storage on some mobile systems, so check which desk you are
using and use a full-desk backup when moving between them.

An ordinary `http://` address on another computer is not a supported offline
setup. Browsers require a secure context for service workers; localhost and
loopback addresses are the local-development exception.

## Exchange mail offline

Choose the threads you are willing to carry, inspect the packing preview,
and download a mailbag. Move that ordinary JSON file using a USB drive, the
operating system’s file sharing, or any file-transfer method you choose.
The receiving desk uses **Open a mailbag**, reviews the contents, and accepts
them. The two browsers need not be open together. The app does not provide or
require a built-in network transport.

On phones, save the incoming JSON file into a location available to the system
file picker, then choose it through **Open a mailbag**. Download/share/file
picker behavior belongs to the browser and operating system; physical-device
coverage is recorded in the release check report.

Reading works without a connection after setup. A thread resumes at its
saved postcard, including after the app closes and reopens. **First unread**,
**Previous postcards**, **Next postcards**, and reply/parent navigation use
mail already on the desk. Saved places and read markers stay in local
storage and full backups; public mailbags do not carry them.

## Keep the desk durable

- A mailbag contains selected public mail and volunteered handoff stamps. It
  is not a backup of the whole desk.
- Use **Desk tools → Back up full desk** before clearing site data, changing
  browsers, changing the hosting address, or moving devices. Backups include
  local drafts, preferences, and saved reading positions, so keep them private.
- Browser storage belongs to its origin and browser profile. Changing the
  protocol, hostname, port, or installation folder opens a different desk.
- Private browsing, clearing site data, low storage, or browser eviction can
  remove mail or the cached app. Browser persistence permission can reduce
  eviction risk but is not a substitute for downloaded backups.
- A restored backup retains the station identity and known paths. For a
  second, independent participant, begin with a fresh desk instead of cloning
  another person’s backup.

## Updating a hosted release

Keep the same address and installation folder to keep the local desk.
Publish the complete new release, including its service worker, together.
Each release that changes runtime files must change the visible application
version and service-worker cache version. Since v1.4, the service worker embeds SHA-256 checksums for its
cached runtime files; v1.5 includes 14, with the new reader module.
Installation and missing-file repair use those
checksums, so a newer file cannot silently enter an older release's cache.
The worker installs only after the whole required set has cached successfully;
user mail is never stored in that cache. Reload
after the new worker activates to use the new app. Make a full-desk backup
before a major schema update.

Version 1.5 migrates private desk schemas 1, 2, and 3 to schema **4** in one
guarded save. Existing IDs, drafts, preferences, selections, replay receipts,
and paths survive. Existing read markers and history survive; the original
schema-1 migration still marks legacy mail read. Saved reading positions
start empty for every older schema. The outbox starts empty for schemas 1
and 2, which did not retain outgoing bag IDs; a schema-3 outbox remains intact.

New full-desk backups use version **4**. Backup versions **1–4** can be
restored, and public mailbags remain version **1**. Apps through v1.4 reject
version-4 private backups. Before upgrading, keep a backup made by the old
app if you may need to roll back. Downgrading the static files does not
convert the migrated local desk back to an older schema.

The Outbox works offline from the desk's retained message/path references.
**Download same bag** reconstructs its original file with the original bag
ID and packed marks. **Pack current threads** opens a fresh review of the
conversation as it exists now. Neither action requires a transport server.

### Editing and publishing source

The shipped folder is ready to serve. After editing a runtime file, update
the version in `package.json`, `src/core.js`, `index.html`, and `sw.js`, then
run `node scripts/refresh-shell-integrity.mjs`. Run it with `--check` to verify
the generated checksums. Then run `npm run build:web` and `npm run check:web`
to regenerate and verify the deployment copy. Publish the complete contents
of `web/`, with automatic HTML,
CSS, and JavaScript rewriting disabled. Ordinary HTTP compression is fine
when the decoded content is unchanged.

A partial deployment fails the new worker's installation; it does not replace
the previous complete cache. An older v1.4 worker also refuses to repair an
evicted asset with bytes from another release. Finish publishing the complete
release and reopen while connected if offline setup remains incomplete.
Cache cleanup preserves newer, unknown-version, and other-installation
caches. This does not change the independent IndexedDB mail desk.

## Technical references

- MDN: [Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- MDN: [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- MDN: [StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- W3C: [Cache.addAll request and batch behavior](https://www.w3.org/TR/service-workers/#dom-cache-addall)
- WHATWG: [Fetch integrity checks](https://fetch.spec.whatwg.org/#main-fetch)

These browser constraints describe the hosting requirements. The release’s
check report separately identifies the actual browsers and paths exercised.
