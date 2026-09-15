import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function temporaryDatabase() {
  const base = resolve('.tmp/stage-2');
  mkdirSync(base, { recursive: true });
  const path = join(mkdtempSync(join(base, 'case-')), 'test.sqlite');
  return { path, db: new DatabaseSync(path) };
}
