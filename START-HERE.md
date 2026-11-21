# Sneakernet Social Club — GitHub and web-server package

**Application version: 1.5.0-rc.1.** This packaging update adds a ready-to-upload
`web/` directory. Its application files are byte-for-byte identical to the
previously delivered v1.5.0-rc.1 release. Browser acceptance is still pending;
the packaging change does not promote the candidate to a stable release.

## Choose what you need

| Goal | What to use |
| --- | --- |
| Put the project in GitHub | The complete `sneakernet-social-club/` folder. Its contents form the repository root. It includes runnable source, generated `web/`, README, license, examples, tests, scripts, and an acceptance workflow. |
| Put the app on a web server | Upload **the contents of `web/`** to the folder where you want the app's `index.html` to live. Preserve its `src/` and `assets/` subfolders. |
| Try the deployment folder locally | From the repository root, run `python3 serve.py --web`, then open `http://127.0.0.1:8787/`. |
| Edit the app | Edit the source files at the repository root, then regenerate and verify `web/` using the commands below. |

## Deploy in three steps

1. Copy everything inside `web/` into an HTTPS web folder. For example, to
   serve the app at `https://your-site.example/sneakernet/`, put its
   `index.html` directly in that `sneakernet/` folder.
2. Open that address and wait for **Offline ready**. Bookmark the address.
3. Reopen the same address in the same browser profile when disconnected.

The web server needs only static-file hosting. There is no backend, database,
account service, runtime package installation, or server-side build. Serve
JavaScript as JavaScript and keep the application files unchanged; disable
host settings that rewrite/minify their contents. HTTP compression is fine.
The longer [hosting guide](docs/OFFLINE.md) explains setup and updates.

**Updating an existing desk:** back up the full desk first, then upload the
contents of `web/` to the **same existing app address and folder**. Do not add
`/web/` to the URL of an existing installation just because the package uses
that folder name. A different origin or installation path gets a separate
desk. Wait for offline readiness after updating.

## GitHub

Keep the complete extracted project as the repository root, including the
included acceptance workflow and ignore rules. `README.md` is the project
landing page; `LICENSE` contains the MIT license. Commit `web/` too so the
ready-to-host directory is available from a normal repository checkout.

The workflow checks generated web/source parity and runs the existing model
and browser suites when it executes in GitHub Actions. It does not deploy a
site. No repository was created, pushed, or published by preparing this ZIP.

The repository root is also a runnable copy of the app. A static host may
serve `web/` as its publish directory; ordinary file hosting can receive
the contents of that directory directly. No build command is required for
the shipped copy.

## Editing and rebuilding the deployment folder

The root `index.html`, `styles.css`, `src/`, assets, manifest, and service
worker are the editable source. `web/` is generated from an explicit
allowlist; edit the source copy and rebuild rather than maintaining two copies.

After changing runtime files, update the visible application and worker
version as described in [OFFLINE.md](docs/OFFLINE.md), then run:

```sh
npm run refresh:offline
npm run build:web
npm run check:web
npm test
```

These commands need Node 22 or newer and no runtime dependencies. Browser
acceptance has its separate optional Playwright installation steps in the
[validation record](docs/VALIDATION.md).

The web packager copies only the required application files, license, and
static-host marker. It refuses unexpected files in `web/` rather than deleting
them or copying them into a release.

## Mail and examples

Each person's mail, station, drafts, settings, and reading positions stay in
that browser's storage. They are not shipped as application files. Keep
downloaded mailbags and private full-desk backups outside the repository and
web-server directory.

Fictional sample files are in `examples/`, outside `web/`. The app's separate
**Try a delivery** example also remains available without adding sample mail
to a person's working desk.

## Check records

- [Release validation](docs/VALIDATION.md): 117 earlier extracted-release
  automated passes and 27 earlier prior-release compatibility passes, with
  browser coverage identified separately.
- [This package's deployment checks](docs/DELIVERY-PACKAGE-CHECKS.json): exact
  runtime parity, generated-directory checks, static HTTP entry points,
  asset references, syntax, and archive checks for this packaging update.

Desktop and phone browser acceptance were not rerun for this packaging update.
