#!/usr/bin/env node
// Create the static deployment folder from an explicit application allowlist.
// User mail, backups, tests, and development files are never copied into web/.
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'web');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  console.error('Usage: node scripts/package-web.mjs [--check]');
  process.exit(1);
}
const check = args[0] === '--check';

async function filesWithin(directory) {
  let entries;
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a real directory: ${relative(root, directory)}`);
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const result = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`The deployment folder must not contain symlinks: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...await filesWithin(path));
    else if (entry.isFile()) result.push(relative(destination, path).split('\\').join('/'));
    else throw new Error(`Unsupported deployment entry: ${relative(root, path)}`);
  }
  return result;
}

try {
  execFileSync(process.execPath, [join(root, 'scripts/refresh-shell-integrity.mjs'), '--check'], { stdio: 'pipe' });
  const worker = await readFile(join(root, 'sw.js'), 'utf8');
  const matched = /const REQUIRED_FILES = (\[[\s\S]*?\]);/.exec(worker);
  if (!matched) throw new Error('The service worker does not expose its required-file allowlist.');
  const required = JSON.parse(matched[1]);
  if (!Array.isArray(required) || required.some(path => typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..'))) {
    throw new Error('The offline allowlist contains an unsupported path.');
  }
  const payload = new Map();
  for (const path of [...new Set([...required, 'sw.js', 'LICENSE'])].sort()) {
    const source = join(root, path);
    if (!(await lstat(source)).isFile() || (await lstat(source)).isSymbolicLink()) throw new Error(`Expected a regular source file: ${path}`);
    payload.set(path, await readFile(source));
  }
  payload.set('.nojekyll', Buffer.alloc(0));
  const existing = await filesWithin(destination);
  const unexpected = existing.filter(path => !payload.has(path));
  if (unexpected.length) throw new Error(`web/ contains files outside the deployment allowlist. Move them outside web/ before continuing: ${unexpected.join(', ')}`);
  if (!check) {
    for (const [path, contents] of payload) {
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await writeFile(join(destination, path), contents);
    }
  }
  for (const [path, contents] of payload) {
    let actual;
    try { actual = await readFile(join(destination, path)); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`web/${path} is missing. Run npm run build:web.`);
      throw error;
    }
    if (!actual.equals(contents)) throw new Error(`web/${path} differs from its source. Run npm run build:web.`);
  }
  const finalFiles = await filesWithin(destination);
  if (finalFiles.length !== payload.size) throw new Error('The deployment file count does not match the allowlist.');
  console.log(`${check ? 'Verified' : 'Prepared'} web/: ${required.length + 1} runtime files, license, and static-host marker (${payload.size} files).`);
  console.log('Upload the contents of web/ to the intended HTTPS app folder. No server-side build or package install is needed.');
} catch (error) {
  console.error(error.message);
  if (error.stderr) console.error(String(error.stderr).trim());
  process.exitCode = 1;
}
