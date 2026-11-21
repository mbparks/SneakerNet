# Larger-desk measurements — v1.4.0-rc.1

These are **Node model measurements, not browser or phone timings**. They
compare the actual `src/core.js` extracted from the delivered v1.3.0-rc.1 ZIP
with the packaged v1.4 model. Raw samples and environment metadata are in
`PERFORMANCE-RESULTS.json`.

## Method

Deterministic fictional desks are fully validated by both versions, with
equivalent normalized state checked before timing. Each operation runs twice
to warm up, followed by five timed samples. Version order alternates for each
sample. The table reports the median wall time; no timing threshold is used
as a test assertion. Host load and garbage collection affect the result.

Board and packing calculations include construction of a new shared index
for the current version. Repeated search reuses that snapshot index, as the
interface does while typing. Timings exclude DOM construction/rendering,
IndexedDB, downloads, file pickers, service workers, native printing, and
device-level transfer.

| Fixture | Threads | Postcards | Known paths | Path steps | Reserved backup bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Club desk | 50 | 100 | 200 | 800 | 257,507 |
| Busy tray | 2,000 | 2,000 | 2,000 | 12,000 | 3,849,635 |
| Travelled desk | 500 | 1,000 | 2,000 | 18,000 | 4,790,576 |

Fictional desks include repeated local packing references, mixed read/flag
state, participant postmarks, and copy branches with shared origins. Separate
regression checks cover clock reversals. Fixtures are generated only for
checks, never loaded into a person's mail desk.

## Results that drove the changes

| Fixture and operation | v1.3 median | v1.4 median | Ratio, previous/current |
| --- | ---: | ---: | ---: |
| Busy tray: board facts | 164.761 ms | 4.414 ms | 37.3× |
| Busy tray: packing facts | 75.579 ms | 7.182 ms | 10.5× |
| Busy tray: search existing snapshot | 1.959 ms | 0.306 ms | 6.4× |
| Busy tray: prepare 10 threads | 286.182 ms | 282.883 ms | 1.0× |
| Busy tray: serialize backup | 208.866 ms | 202.454 ms | 1.0× |
| Busy tray: restore backup | 144.085 ms | 152.980 ms | 0.9× |
| Travelled desk: board facts | 29.584 ms | 2.118 ms | 14.0× |
| Travelled desk: packing facts | 19.430 ms | 2.516 ms | 7.7× |
| Travelled desk: preview 10 incoming messages | 325.914 ms | 311.136 ms | 1.0× |
| Travelled desk: accept 10 incoming messages | 463.406 ms | 425.204 ms | 1.1× |
| Travelled desk: serialize backup | 308.799 ms | 250.489 ms | 1.2× |
| Travelled desk: restore backup | 202.771 ms | 201.868 ms | 1.0× |

The improvement is concentrated in repeated read-only scans. It is not a
universal speedup: busy-tray validation measured 148.858→152.323 ms, restore
also increased slightly, and small-desk packing facts measured
0.497→0.520 ms. The full results retain these outcomes.

## What changed

`createDeskIndex` shares thread membership, origin station, message/path
lookups, read/flag sets, latest packing receipt, and per-postcard search text.
The interface replaces its index when the committed desk snapshot changes.
Search does not merge neighboring postcard strings or include private drafts.
An index for a different snapshot is rejected by the fact helpers.

Validated immutable message/postmark comparisons now compare their known
primitive fields without repeatedly allocating canonical JSON. Validation
still rejects unknown fields, identity collisions, and path splicing. Reply
IDs, causal order, branch retention, and wire format did not change.

Board, packing choices, and manifests render at most 12 items per page. All
items remain searchable or available through navigation, and selections live
outside the rendered rows. The existing reader is retained during searches
of the same snapshot; Mail Call uses independent flip state. These DOM
changes have simulated contract tests and prepared browser tests, but their
visual performance has not been measured here.

## Limits and remaining costs

The app still validates and stores complete transactional snapshots. Large
imports and exports can take several hundred milliseconds in this Node
environment. The full thread reader and an individual postcard back can
still show a long history. Device timing and real usage should determine
whether background processing or further rendering work is useful.

Supported limits are unchanged. A separate regression fixture reaches
2,000 messages, 4,000 paths, and 20,000 steps together. A 512-step path is
retained exactly and refuses another packing atomically. No benchmark raises
a protocol limit or truncates history. Capacity bytes are measured on demand
in Desk tools, not on every search keystroke.

## Reproduce

From the application folder, with Node 22+ and Python 3:

```sh
python3 scripts/check-performance.py /path/to/Sneakernet-Social-Club-v1.3.0-rc.1.zip
```

The script reads only the previous core module into a temporary directory,
runs both models with fictional data, and prints JSON. It does not launch a
browser, access a saved desk, or transmit mail. The retained compatibility
report separately records the SHA-256 of the actual previous archive.
