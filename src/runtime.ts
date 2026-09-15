import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from './db/database.js';

export function openConfiguredDatabase(path = process.env.DATABASE_PATH ?? 'data/discussions.sqlite'): DatabaseSync {
  if (!path.trim()) throw new Error('INVALID_DATABASE_PATH');
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  try {
    initializeDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
