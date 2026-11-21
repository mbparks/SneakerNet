#!/usr/bin/env python3
"""Check current wire and desk compatibility against actual prior release ZIPs.

Uses fictional in-memory desks and actual serializers. This is a Node protocol
check, not browser/file-picker/offline acceptance. Requires Python 3 and Node.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from zipfile import ZipFile

CHECK = r'''
import assert from 'node:assert/strict';
const previous = await import(process.argv[1]);
const current = await import(process.argv[2]);
const checks = [];
const notApplicable = [];
const station = (model, handle, postmark) => {
  const desk = model.newDesk();
  desk.station.handle = handle;
  desk.station.postmark = postmark;
  return desk;
};
let a = station(current, 'compat-cumberland', 'Fictional Cumberland Meetup');
let b = station(previous, 'compat-carrier', 'Fictional hamfest');
const posted = current.createMessage(a, {body: 'Compatibility example: spare rotary encoder?'});
a = posted.desk;
a.drafts.post = 'PRIVATE: this draft must stay out of the public bag.';
if (current.recordReading) a = current.recordReading(a, {messageIds: [posted.message.id], anchorId: posted.message.id});
const outbound = current.prepareMailbag(a, [posted.message.id]);
a = outbound.desk;
const original = current.serializeMailbag(outbound.bag);
assert.equal(JSON.parse(original).version, 1);
assert.equal(original.includes('PRIVATE:'), false);
assert.equal(original.includes('outbox'), false);
assert.equal(original.includes('readingPositions'), false);
b = (await previous.acceptMailbag(b, (await previous.previewMailbag(b, original)).bag)).desk;
assert.equal(b.messages.length, 1);
checks.push({name: 'Previous release accepts a newly packed current public bag', status: 'passed'});

b = previous.createMessage(b, {parentId: posted.message.id, body: 'Compatibility reply carried by the previous release.'}).desk;
const returning = previous.prepareMailbag(b, [posted.message.id]);
b = returning.desk;
const previousReturnText = previous.serializeMailbag(returning.bag);
a = (await current.acceptMailbag(a, (await current.previewMailbag(a, previousReturnText)).bag)).desk;
assert.equal(current.groupThreads(a).length, 1);
assert.equal(a.messages.length, 2);
checks.push({name: 'Previous-release reply returns to one current thread', status: 'passed'});

const repeated = current.serializeMailbag(current.rebuildMailbag(a, outbound.bag.id));
assert.equal(repeated, original);
const unchanged = await previous.acceptMailbag(b, (await previous.previewMailbag(b, repeated)).bag);
assert.equal(unchanged.desk, b);
checks.push({name: 'Exact original re-download is a no-op in the previous recipient', status: 'passed'});

const oldBackup = previous.serializeBackup(b);
const migrated = current.parseBackup(oldBackup);
assert.equal(migrated.schemaVersion, current.newDesk().schemaVersion);
assert.deepEqual(migrated.local.outbox, b.local.outbox || []);
if (current.recordReading) assert.deepEqual(migrated.local.readingPositions, b.local.readingPositions || []);
for (const key of ['station', 'messages', 'routes', 'seenBags', 'drafts', 'selected', 'preferences'])
  assert.deepEqual(migrated[key], b[key]);
for (const key of Object.keys(b.local)) assert.deepEqual(migrated.local[key], b.local[key]);
checks.push({name: 'Actual previous backup migrates without losing prior desk fields', status: 'passed'});

const restored = current.parseBackup(current.serializeBackup(migrated));
assert.deepEqual(restored, migrated);
const priorReplyReplay = await current.acceptMailbag(restored, (await current.previewMailbag(restored, original)).bag);
assert.equal(priorReplyReplay.desk, restored);
checks.push({name: 'Current full-desk round trip retains previous import replay receipts', status: 'passed'});

if (current.recordReading) {
  const anchor = restored.messages.find(message => message.parentId === posted.message.id).id;
  const positioned = current.recordReading(restored, {messageIds: [anchor], anchorId: anchor});
  assert.deepEqual(positioned.local.readingPositions, [anchor]);
  const recovered = current.parseBackup(current.serializeBackup(positioned));
  assert.deepEqual(recovered, positioned);
  const carried = current.serializeMailbag(current.prepareMailbag(recovered, [posted.message.id]).bag);
  assert.equal(carried.includes('readingPositions'), false);
  checks.push({name: 'Migrated desk gains a private message anchor that survives full restore and stays out of public bags', status: 'passed'});
}

if (previous.rebuildMailbag) {
  assert.equal(current.serializeMailbag(current.rebuildMailbag(restored, returning.bag.id)), previousReturnText);
  const extended = current.createMessage(restored, {parentId: posted.message.id, body: 'Later current-release reply after upgrade.'});
  const repacked = current.prepareMailbag(extended.desk, [posted.message.id]);
  const recovered = current.parseBackup(current.serializeBackup(repacked.desk));
  assert.equal(current.serializeMailbag(current.rebuildMailbag(recovered, returning.bag.id)), previousReturnText);
  assert.equal(current.serializeMailbag(current.rebuildMailbag(recovered, repacked.bag.id)), current.serializeMailbag(repacked.bag));
  checks.push({name: 'Prior exact packed-bag receipts survive upgrade, later replies, repacking, and restore', status: 'passed'});
} else {
  assert.deepEqual(restored.local.outbox, []);
  checks.push({name: 'A release without an outbox migrates without inventing packed-bag receipts', status: 'passed'});
}

if (previous.newDesk().schemaVersion === current.newDesk().schemaVersion) {
  const backwardRestore = previous.parseBackup(current.serializeBackup(restored));
  assert.deepEqual(backwardRestore, b);
  if (previous.rebuildMailbag) assert.equal(previous.serializeMailbag(previous.rebuildMailbag(backwardRestore, returning.bag.id)), previousReturnText);
  checks.push({name: 'Same-schema current backup opens in the prior release without losing its desk or receipt bytes', status: 'passed'});
} else {
  const before = JSON.stringify(b);
  assert.throws(() => previous.parseBackup(current.serializeBackup(restored)), /unsupported|version/i);
  assert.equal(JSON.stringify(b), before, 'an older app must keep its existing desk when it cannot read a future backup');
  checks.push({name: 'Previous release safely rejects the newer private backup version without changing its desk', status: 'passed'});
  notApplicable.push({name: 'Opening current private backups in the prior release', reason: 'Private desk schema differs; retain the earlier backup for rollback.'});
}

const next = current.prepareMailbag(a, [posted.message.id]);
const refreshed = await previous.acceptMailbag(b, (await previous.previewMailbag(b, current.serializeMailbag(next.bag))).bag);
assert.equal(refreshed.desk.messages.length, 2);
assert.equal(previous.groupThreads(refreshed.desk).length, 1);
checks.push({name: 'Current repacking of the completed thread still opens in the previous release', status: 'passed'});
console.log(JSON.stringify({suite: 'Previous-release Node protocol compatibility', browserAcceptance: false,
  previousAppVersion: previous.VERSION, currentAppVersion: current.VERSION,
  previousBackupVersion: JSON.parse(oldBackup).version, currentDeskSchema: migrated.schemaVersion,
  checks, notApplicable, summary: {passed: checks.length, failed: 0}}, null, 2));
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous_zip', type=Path, nargs='+', help='One or more delivered release ZIPs, such as v1.2.0, v1.3.0-rc.1 and v1.4.0-rc.1')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    runs = []
    for release in args.previous_zip:
        with ZipFile(release) as archive:
            candidates = [name for name in archive.namelist() if name.endswith('/src/core.js')]
            if len(candidates) != 1:
                parser.error('Each ZIP must contain exactly one application src/core.js.')
            source = archive.read(candidates[0])
        with tempfile.TemporaryDirectory(prefix='sneakernet-compat-') as directory:
            old_module = Path(directory) / 'previous-core.mjs'
            old_module.write_bytes(source)
            result = subprocess.run(['node', '--input-type=module', '-e', CHECK,
                                     old_module.as_uri(), (root / 'src/core.js').as_uri()],
                                    capture_output=True, text=True)
        if result.returncode:
            print(f'Compatibility failed for {release.name}', file=sys.stderr)
            if result.stdout:
                print(result.stdout, end='', file=sys.stderr)
            if result.stderr:
                print(result.stderr, end='', file=sys.stderr)
            raise SystemExit(result.returncode)
        checked = json.loads(result.stdout)
        checked['previousSource'] = {'archive': release.name,
                                     'archiveSha256': hashlib.sha256(release.read_bytes()).hexdigest(),
                                     'coreSha256': hashlib.sha256(source).hexdigest()}
        runs.append(checked)
    if len(runs) == 1:
        print(json.dumps(runs[0], indent=2))
    else:
        print(json.dumps({'suite': 'Previous-release Node compatibility matrix',
                          'browserAcceptance': False,
                          'currentAppVersion': runs[0]['currentAppVersion'],
                          'runs': runs,
                          'summary': {'passed': sum(run['summary']['passed'] for run in runs), 'failed': 0}}, indent=2))


if __name__ == '__main__':
    main()
