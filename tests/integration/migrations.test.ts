import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrateDatabase, assertCurrentSchema } from '../../src/db/migrations.js';
import { DraftService } from '../../src/domain/drafts.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { randomUUID } from 'node:crypto';

const oldSql = readFileSync(new URL('../fixtures/schema-v1.sql', import.meta.url), 'utf8');
let db: DatabaseSync;
let path: string;
beforeEach(() => {
  mkdirSync('.tmp/stage-4b', { recursive: true });
  path = join(mkdtempSync(resolve('.tmp/stage-4b/migration-')), 'test.sqlite');
  db = new DatabaseSync(path);
});
afterEach(() => db.close());
const tables = () => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row => row.name);
function seed() {
  db.exec(oldSql);
  const service = new DraftService(new SqliteDraftStore(db));
  const input = { topic: '\u0000中文 "旧草稿"', requestId: randomUUID() };
  return { input, created: service.create(input), service };
}
it('001在空库只建立旧业务两表与迁移记录', () => {
  migrateDatabase(db, 1);
  expect(tables()).toEqual(['discussions', 'public_events', 'schema_migrations']);
  expect(db.prepare('SELECT id,name FROM schema_migrations').all()).toEqual([{ id: 1, name: '001_draft_baseline' }]);
  expect(db.prepare('PRAGMA table_info(discussions)').all().map(row => row.name)).not.toContain('current_generation_id');
});
it('001严格接管真实旧schema，所有行及事件完整保留', () => {
  const { created, input, service } = seed();
  const before = db.prepare('SELECT * FROM discussions').all();
  const events = db.prepare('SELECT * FROM public_events').all();
  migrateDatabase(db, 1);
  expect(db.prepare('SELECT * FROM discussions').all()).toEqual(before);
  expect(db.prepare('SELECT * FROM public_events').all()).toEqual(events);
  expect(service.get(created.discussionId)).toEqual(created.snapshot);
  expect(service.create(input).replayed).toBe(true);
});
it.each(['different-check', 'partial', 'unknown-trigger'])('001拒绝未知结构 %s 且不写半份迁移', variant => {
  if (variant === 'partial') db.exec('CREATE TABLE discussions(id TEXT)');
  else {
    db.exec(variant === 'different-check' ? oldSql.replace('length(CAST(topic AS BLOB)) BETWEEN 1 AND 2000', 'length(topic) BETWEEN 1 AND 500') : oldSql);
    if (variant === 'unknown-trigger') db.exec('CREATE TRIGGER unknown_change AFTER INSERT ON discussions BEGIN SELECT 1; END');
  }
  const before = db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
  expect(() => migrateDatabase(db, 1)).toThrow('SCHEMA_MISMATCH');
  expect(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(before);
  expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
});
it('001重复执行与数据库重开不变更记录时间或业务', () => {
  const { created } = seed(); migrateDatabase(db, 1);
  const versions = db.prepare('SELECT * FROM schema_migrations').all();
  migrateDatabase(db, 1); db.close(); db = new DatabaseSync(path); migrateDatabase(db, 1);
  expect(db.prepare('SELECT * FROM schema_migrations').all()).toEqual(versions);
  expect(new DraftService(new SqliteDraftStore(db)).get(created.discussionId)).toEqual(created.snapshot);
});
it('001记录checksum被改变时拒绝继续', () => {
  migrateDatabase(db, 1);
  db.prepare("UPDATE schema_migrations SET checksum = 'modified'").run();
  expect(() => migrateDatabase(db, 1)).toThrow('MIGRATION_HISTORY_MISMATCH');
  expect(() => assertCurrentSchema(db)).toThrow('MIGRATION_HISTORY_MISMATCH');
});
