import { createRequire } from 'node:module';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const expectedRoot = realpathSync(resolve('node_modules')) + sep;
const packages = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).map(([name, expected]) => {
  const path = realpathSync(require.resolve(`${name}/package.json`));
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!path.startsWith(expectedRoot) || data.version !== expected) throw new Error(`Unexpected dependency source: ${name}`);
  return { name, version: data.version, packageJsonPath: path, expected, local: true };
});
const data = { cwd: process.cwd(), nodeExecutable: process.execPath, nodeVersion: process.version, sqliteVersion: process.versions.sqlite, packages };
writeFileSync('evidence/dependency-provenance.json', JSON.stringify(data, null, 2));
console.log(JSON.stringify(data));
