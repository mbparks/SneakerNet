# Model measurements — v1.5.0-rc.1

These are **Node model measurements**. The fresh run compares actual
`src/core.js` extracted from the delivered v1.4.0-rc.1 ZIP with the v1.5 model.
It does not measure browser or phone speed, or the new reader's responsiveness.
Raw samples and environment metadata are in
[PERFORMANCE-RESULTS.json](PERFORMANCE-RESULTS.json).

The historical v1.3/v1.4 optimization report and its larger speedups remain
in [PERFORMANCE-v1.4.md](PERFORMANCE-v1.4.md) and
[PERFORMANCE-RESULTS-v1.4.json](PERFORMANCE-RESULTS-v1.4.json). They are not
relabelled as v1.5 measurements.

## Method

Three deterministic fictional desks are validated by both releases before
timing. Semantic equality checks migrate the prior desk and restored backup
to the current schema outside the timed region. Each timed operation uses
that release's native desk and backup schema: v1.4 uses 3, v1.5 uses 4.

Each operation has two warmups and five timed samples per release. Execution
order alternates. There are 25 operation pairs and 250 timed samples; the
full 2,000-message fixture cannot accept another ten messages, so its import
operations are omitted. Tables report median wall time, with no timing
threshold used as a test assertion. Host load and garbage collection can
change the result.

Both versions build a fresh shared index for board/packing facts. Repeated
search reuses an existing snapshot index. Timings exclude DOM construction,
IndexedDB, downloads, file pickers, service workers, printing, and device
transfer. The fixtures migrate with empty reading-position lists; this run
does not measure `recordReading`, section changes, or populated anchor lists.

| Fixture | Threads | Postcards | Known paths | Path steps | v1.5 reserved backup bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Club desk | 50 | 100 | 200 | 800 | 257,529 |
| Busy tray | 2,000 | 2,000 | 2,000 | 12,000 | 3,849,657 |
| Travelled desk | 500 | 1,000 | 2,000 | 18,000 | 4,790,598 |

The empty reading-position field increases each fixture's reserved backup
size by 22 bytes. Fixtures contain mixed read/flag state, packing receipts,
participant postmarks, and copy branches; they are generated for checks and
never loaded into a person's working mail desk.

## Current results

| Fixture and operation | v1.4 median | v1.5 median |
| --- | ---: | ---: |
| Club desk: board facts | 0.248 ms | 0.301 ms |
| Club desk: restore backup | 8.017 ms | 9.666 ms |
| Busy tray: board facts | 3.725 ms | 4.102 ms |
| Busy tray: packing facts | 5.071 ms | 4.781 ms |
| Busy tray: search existing snapshot | 0.217 ms | 0.257 ms |
| Busy tray: prepare 10 threads | 230.531 ms | 232.428 ms |
| Busy tray: serialize backup | 158.802 ms | 160.699 ms |
| Busy tray: restore backup | 123.381 ms | 132.055 ms |
| Travelled desk: board facts | 1.978 ms | 1.713 ms |
| Travelled desk: packing facts | 2.428 ms | 2.229 ms |
| Travelled desk: prepare 10 threads | 314.042 ms | 334.463 ms |
| Travelled desk: preview 10 incoming messages | 418.515 ms | 260.197 ms |
| Travelled desk: accept 10 incoming messages | 392.125 ms | 356.207 ms |
| Travelled desk: serialize backup | 287.634 ms | 249.115 ms |
| Travelled desk: restore backup | 214.698 ms | 200.836 ms |

The outcomes are mixed. Some operations improved in this run, while busy-tray
board calculation, search and restore, and travelled-desk packing took longer.
There is no general speedup claim. Samples also vary substantially: the v1.5
travelled-desk preview samples range from 183.554 to 815.081 ms. One median
cannot establish the latency a particular phone or browser will experience.

## Reading changes and remaining costs

The v1.5 main reader constructs at most 12 postcards per section and saves a
message anchor separately from public mail. Simulated view checks cover the
section and navigation contracts. Current browser checks are prepared but
not run, so the bounded construction is not a measured rendering-speed claim.

The app still validates and stores complete transactional snapshots. Imports,
packing, backup and restore can take hundreds of milliseconds in this Node
environment. An individual postcard back may still contain a long history.
Actual device timings and field use should determine whether further work
on rendering or background processing is warranted.

Supported limits remain 2,000 postcards, 4,000 paths, 20,000 path steps,
512 steps in one path, 5 MiB per bag, and 20 MiB per full backup. Regression
fixtures cover combined limits and atomic rejection without shortening
history. Saved positions are included in the backup capacity calculation.

## Reproduce

From the application folder, with Node 22+ and Python 3:

```sh
python3 scripts/check-performance.py /path/to/Sneakernet-Social-Club-v1.4.0-rc.1.zip
```

The script extracts the previous core into a temporary directory, runs both
models with fictional data, and prints JSON. It does not launch a browser,
access a saved desk, or transmit mail. The separate
[compatibility report](COMPATIBILITY-RESULTS-v1.5.json) records the SHA-256 of
the actual previous archive.
