import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { schemaV1 } from './schema-v1.js';
import { schemaV2 } from './schema-v2.js';

const ledgerSql = `CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY CHECK(id > 0), name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL, applied_at TEXT NOT NULL
) STRICT;`;
const migrations = [{ id: 1, name: '001_draft_baseline', sql: schemaV1 }, { id: 2, name: '002_lineup', sql: schemaV2 }];
function fingerprint(db: DatabaseSync): string {
  return JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name').all()
    .map(row => ({ ...row, sql: typeof row.sql === 'string' ? row.sql.replace(/\s+/g, ' ').trim() : row.sql })));
}
function expectedSchema(version: number): string {
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(schemaV1);
    if (version > 0) reference.exec(ledgerSql);
    if (version >= 2) { reference.exec('PRAGMA foreign_keys=OFF'); reference.exec(schemaV2); }
    return fingerprint(reference);
  } finally { reference.close(); }
}
function history(db: DatabaseSync): number {
  const exists = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='schema_migrations'").get();
  if (!exists) return 0;
  const rows = db.prepare('SELECT id,name,checksum FROM schema_migrations ORDER BY id').all();
  if (!rows.length || rows.length > migrations.length) throw new Error('MIGRATION_HISTORY_MISMATCH');
  rows.forEach((row, index) => {
    const migration = migrations[index];
    if (!migration || row.id !== migration.id || row.name !== migration.name ||
        row.checksum !== createHash('sha256').update(migration.sql).digest('hex')) throw new Error('MIGRATION_HISTORY_MISMATCH');
  });
  return rows.length;
}
export function migrateDatabase(db: DatabaseSync, target: 1 | 2 = 2): void {
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 3000;');
  try {
    db.exec('BEGIN IMMEDIATE');
    const current = history(db);
    const empty = db.prepare('SELECT 1 FROM sqlite_schema LIMIT 1').get() === undefined;
    if (!empty && fingerprint(db) !== expectedSchema(current)) throw new Error('SCHEMA_MISMATCH');
    if (target > migrations.length || current > target) throw new Error('MIGRATION_TARGET_UNSUPPORTED');
    if (!current) {
      if (empty) db.exec(schemaV1);
      db.exec(ledgerSql);
      db.prepare('INSERT INTO schema_migrations VALUES (1, ?, ?, ?)').run('001_draft_baseline',
        createHash('sha256').update(schemaV1).digest('hex'), new Date().toISOString());
    }
    if (current < 2 && target === 2) {
      const oldColumns = 'id,hex(topic) AS topic,expert_count,status,version,last_event_id,create_request_id,created_at,updated_at';
      const before = JSON.stringify(db.prepare(`SELECT ${oldColumns} FROM discussions ORDER BY id`).all());
      const events = JSON.stringify(db.prepare('SELECT * FROM public_events ORDER BY discussion_id,event_id').all());
      db.exec(schemaV2);
      if (before !== JSON.stringify(db.prepare(`SELECT ${oldColumns} FROM discussions ORDER BY id`).all()) ||
          events !== JSON.stringify(db.prepare('SELECT * FROM public_events ORDER BY discussion_id,event_id').all())) throw new Error('MIGRATION_DATA_CHANGED');
      db.prepare('INSERT INTO schema_migrations VALUES (2, ?, ?, ?)').run('002_lineup',
        createHash('sha256').update(schemaV2).digest('hex'), new Date().toISOString());
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length || db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') {
      throw new Error('MIGRATION_INTEGRITY_FAILED');
    }
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    if (db.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1) throw new Error('FOREIGN_KEYS_DISABLED');
  }
}
export function assertCurrentSchema(db: DatabaseSync): void {
  if (history(db) !== migrations.length) throw new Error('MIGRATION_REQUIRED');
  if (fingerprint(db) !== expectedSchema(migrations.length)) throw new Error('SCHEMA_MISMATCH');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
}
