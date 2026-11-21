#!/usr/bin/env node
/** Refresh the embedded offline checksums after editing runtime files. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  console.error('Usage: node scripts/refresh-shell-integrity.mjs [--check]');
  process.exitCode = 1;
} else {
  const root = new URL('../', import.meta.url);
  const workerFile = new URL('sw.js', root);
  const source = await readFile(workerFile, 'utf8');
  const list = source.match(/^const REQUIRED_FILES = (\[[\s\S]*?\n\]);$/m);
  if (!list) throw new Error('sw.js must contain the JSON-compatible REQUIRED_FILES array.');
  const files = JSON.parse(list[1]);
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length || files.some(path =>
    typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').includes('..') || path === 'sw.js')) {
    throw new Error('Offline files must be unique relative runtime paths without sw.js.');
  }
  const entries = await Promise.all(files.map(async path => [path,
    `sha256-${createHash('sha256').update(await readFile(new URL(path, root))).digest('base64')}`,
  ]));
  const block = `// BEGIN GENERATED SHELL INTEGRITY\nconst REQUIRED_INTEGRITY = ${JSON.stringify(Object.fromEntries(entries), null, 2)};\n// END GENERATED SHELL INTEGRITY`;
  const pattern = /\/\/ BEGIN GENERATED SHELL INTEGRITY\n[\s\S]*?\n\/\/ END GENERATED SHELL INTEGRITY/g;
  if ([...source.matchAll(pattern)].length !== 1) throw new Error('sw.js must contain exactly one generated integrity block.');
  const updated = source.replace(pattern, block);
  if (args[0] === '--check') {
    if (updated !== source) {
      console.error('Offline checksums are stale. Run node scripts/refresh-shell-integrity.mjs after editing runtime files.');
      process.exitCode = 1;
    } else console.log(`Offline checksums match all ${files.length} runtime files.`);
  } else {
    if (updated !== source) await writeFile(workerFile, updated);
    console.log(`Offline checksums refreshed for ${files.length} runtime files. Publish the complete folder with a new release version.`);
  }
}
