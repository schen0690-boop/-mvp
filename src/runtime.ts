import { mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { initializeDatabase } from './db/database.js';
import { assertCurrentSchema } from './db/migrations.js';

function configuredPath(path: string): string {
  if (!path.trim()) throw new Error('INVALID_DATABASE_PATH');
  return resolve(path);
}
export function openConfiguredDatabase(path = process.env.DATABASE_PATH ?? 'data/discussions.sqlite'): DatabaseSync {
  const resolved = configuredPath(path);
  if (!existsSync(resolved)) throw new Error('MIGRATION_REQUIRED');
  const db = new DatabaseSync(resolved);
  try { assertCurrentSchema(db); return db; }
  catch (error) { db.close(); throw error; }
}
/** Maintenance command: stop other writers; backup path is exclusively reserved. */
export async function initializeConfiguredDatabase(path = process.env.DATABASE_PATH ?? 'data/discussions.sqlite'): Promise<void> {
  const resolved = configuredPath(path), existed = existsSync(resolved);
  mkdirSync(dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  try {
    if (existed) {
      try { assertCurrentSchema(db); return; } catch { /* Migration rejects unknown schemas before writing. */ }
      const destination = `${resolved}.backup-${randomUUID()}.sqlite`;
      closeSync(openSync(destination, 'wx'));
      await backup(db, destination);
      const copy = new DatabaseSync(destination, { readOnly: true });
      try {
        if (copy.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('BACKUP_INVALID');
      } finally { copy.close(); }
    }
    initializeDatabase(db);
  } finally { db.close(); }
}
