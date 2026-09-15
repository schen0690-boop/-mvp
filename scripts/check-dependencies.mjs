import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson('package.json');
const lock = readJson('package-lock.json');
const expected = { ...manifest.dependencies, ...manifest.devDependencies };
assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
const packages = {};
for (const [name, version] of Object.entries(expected)) {
  const local = readJson(resolve('node_modules', name, 'package.json'));
  assert.equal(local.version, version);
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
  packages[name] = { version, path: `node_modules/${name}` };
}
const lifecycleScripts = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  if (entry.resolved) assert.equal(new URL(entry.resolved).hostname, 'registry.npmjs.org');
  assert(!entry.link, 'Formal dependency must not link to probe');
  let installed;
  try { installed = readJson(resolve(path, 'package.json')); } catch (error) {
    if (error.code === 'ENOENT' && entry.optional) continue;
    throw error;
  }
  for (const [hook, command] of Object.entries(installed.scripts ?? {})) {
    if (['preinstall', 'install', 'postinstall', 'prepare'].includes(hook)) lifecycleScripts.push({ package: installed.name, version: installed.version, hook, command, executed: false });
  }
}
const resolution = {};
for (const name of ['express', 'vitest', 'vite', 'typescript']) {
  const path = fileURLToPath(import.meta.resolve(name));
  assert(!path.includes('env-probe'));
  assert(!path.includes('.codex'));
  assert(path.startsWith(resolve('node_modules')));
  resolution[name] = relative(process.cwd(), path);
}
const db = new DatabaseSync(':memory:');
const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
db.close();
console.log(JSON.stringify({ node: process.version, sqliteVersion, packages, resolution,
  lifecycleScripts, installationPolicy: '--ignore-scripts --no-audit --no-fund',
  lockVerified: true, formalDependenciesIndependent: true }, null, 2));
