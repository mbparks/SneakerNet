/** Reproducible Node model measurements; not a browser or device performance claim. */
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as current from '../src/core.js';
import {PROFILES, makeLargeDesk} from '../tests/fixtures/large-desks.mjs';

const previousPath = process.argv[2];
if (!previousPath) throw new Error('Supply a previous core module path, or use check-performance.py with a release ZIP.');
const previous = await import(pathToFileURL(previousPath));
const iterations = 5;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rounded = value => Number(value.toFixed(3));

function operations(model, desk, sourceBag) {
  const index = model.createDeskIndex?.(desk);
  const threads = index?.threads || model.groupThreads(desk);
  const backup = model.serializeBackup(desk), rawBag = model.serializeMailbag(sourceBag);
  const query = 'encoder', selected = threads.slice(0, 10).map(thread => thread.id);
  const result = {
    'validate desk': () => model.validateDesk(desk),
    'build board facts': () => {
      const fresh = model.createDeskIndex?.(desk);
      return (fresh?.threads || model.groupThreads(desk)).map(thread => model.threadFacts(desk, thread, fresh));
    },
    'build packing facts': () => {
      const fresh = model.createDeskIndex?.(desk);
      return (fresh?.threads || model.groupThreads(desk)).map(thread => model.packingFacts(desk, thread, fresh));
    },
    'search existing snapshot': () => index
      ? index.threads.filter(thread => index.searchTextByThread.get(thread.id).some(text => text.includes(query))).map(thread => thread.id)
      : model.groupThreads(desk).filter(thread => thread.messages.some(message => `${message.body} ${message.handle}`.toLocaleLowerCase().includes(query))).map(thread => thread.id),
    'prepare 10 threads': () => model.prepareMailbag(desk, selected),
    'serialize backup': () => model.serializeBackup(desk),
    'restore backup': () => model.parseBackup(backup),
  };
  if (desk.messages.length + sourceBag.messages.length <= model.LIMITS.messages) {
    result['preview 10 incoming messages'] = () => model.previewMailbag(desk, rawBag);
    result['accept 10 incoming messages'] = () => model.acceptMailbag(desk, sourceBag);
  }
  return result;
}

const fixtures = [];
for (const profile of PROFILES) {
  const oldDesk = previous.validateDesk(makeLargeDesk(profile));
  const newDesk = current.validateDesk(makeLargeDesk(profile));
  assert.deepEqual(newDesk, current.validateDesk(oldDesk), 'both releases preserve identical fixture records after schema migration');
  const source = previous.validateDesk(makeLargeDesk({messages: 10, perThread: 2, paths: 1, steps: 3, receipts: 0, offset: 100}));
  const sourceBag = previous.prepareMailbag(source, previous.groupThreads(source).map(thread => thread.id)).bag;
  const oldOperations = operations(previous, oldDesk, sourceBag), newOperations = operations(current, newDesk, sourceBag);
  for (const name of ['build board facts', 'build packing facts', 'search existing snapshot', 'restore backup']) {
    const previousResult = await oldOperations[name]();
    assert.deepEqual(await newOperations[name](), name === 'restore backup' ? current.validateDesk(previousResult) : previousResult, `same ${name} after any schema migration`);
  }
  const measurements = [];
  for (const name of Object.keys(oldOperations)) {
    // Warm each operation, then alternate ordering to reduce first-run/order bias.
    for (let i = 0; i < 2; i++) { await oldOperations[name](); await newOperations[name](); }
    const oldTimes = [], newTimes = [];
    for (let i = 0; i < iterations; i++) {
      for (const version of i % 2 ? ['current', 'previous'] : ['previous', 'current']) {
        const start = performance.now();
        await (version === 'current' ? newOperations[name] : oldOperations[name])();
        (version === 'current' ? newTimes : oldTimes).push(performance.now() - start);
      }
    }
    const before = median(oldTimes), after = median(newTimes);
    measurements.push({operation: name, previousMedianMs: rounded(before), currentMedianMs: rounded(after),
      speedup: rounded(before / after), previousSamplesMs: oldTimes.map(rounded), currentSamplesMs: newTimes.map(rounded)});
  }
  const counts = current.deskCapacity(newDesk);
  fixtures.push({name: profile.name, threads: current.groupThreads(newDesk).length, ...counts, measurements});
}
console.log(JSON.stringify({suite: 'Large-desk Node model comparison', browserAcceptance: false,
  previousAppVersion: previous.VERSION, currentAppVersion: current.VERSION,
  environment: {node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model || 'unknown'},
  method: {fixtures: 'Deterministic fictional data; full validation before timing; prior desk and restored backup normalized through current migration for semantic equality outside timing', warmupsPerOperation: 2,
    samplesPerOperation: iterations, summary: 'Median wall time; alternating release order',
    boardAndPacking: 'Includes building a new shared index per snapshot in current release',
    search: 'Current release reuses snapshot index as the app does while typing',
    boundaryChecks: 'Separate automated tests cover 2,000 messages, 4,000 paths, and 20,000 path steps together',
    limitations: 'No DOM, IndexedDB, file picker, service worker, phone, or browser timing. Host load and garbage collection affect wall times; no timing assertions.'},
  fixtures}, null, 2));
