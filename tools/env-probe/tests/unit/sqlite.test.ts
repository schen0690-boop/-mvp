import { afterEach, beforeEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

let database: DatabaseSync;
let file: string;
beforeEach(() => {
  const tempRoot = join(process.cwd(), '.tmp');
  mkdirSync(tempRoot, { recursive: true });
  file = join(mkdtempSync(join(tempRoot, '数据库-')), '环境探针.sqlite');
  database = new DatabaseSync(file);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('CREATE TABLE sample_parent (id INTEGER PRIMARY KEY, label TEXT NOT NULL UNIQUE)');
  database.exec('CREATE TABLE sample_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES sample_parent(id))');
});
afterEach(() => database?.close());

test('Chinese path and quoted Chinese text round-trip through parameter binding', () => {
  const label = "中文 O'Reilly 与 \"引号\"; DROP TABLE sample_parent; --";
  database.prepare('INSERT INTO sample_parent(id, label) VALUES (?, ?)').run(1, label);
  expect(file).toContain('数据库-');
  expect(database.prepare('SELECT label FROM sample_parent WHERE id = ?').get(1)?.label).toBe(label);
});
test('duplicate primary key is rejected', () => {
  database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '甲');
  expect(() => database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '乙')).toThrow(/UNIQUE/);
});
test('duplicate unique label is rejected', () => {
  database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '甲');
  expect(() => database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(2, '甲')).toThrow(/UNIQUE/);
});
test('foreign keys are enabled and reject an orphan', () => {
  expect(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
  expect(() => database.prepare('INSERT INTO sample_child VALUES (?, ?)').run(1, 999)).toThrow(/FOREIGN KEY/);
});
test('successful transaction commits both records', () => {
  database.exec('BEGIN');
  database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '已提交');
  database.prepare('INSERT INTO sample_child VALUES (?, ?)').run(1, 1);
  database.exec('COMMIT');
  expect(database.prepare('SELECT COUNT(*) AS count FROM sample_child').get()?.count).toBe(1);
});
test('intentional failure rolls back earlier writes', () => {
  database.exec('BEGIN');
  try {
    database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '应回滚');
    database.prepare('INSERT INTO sample_child VALUES (?, ?)').run(1, 999);
    throw new Error('Constraint unexpectedly accepted');
  } catch (error) {
    database.exec('ROLLBACK');
    expect(String(error)).toContain('FOREIGN KEY');
  }
  expect(database.prepare('SELECT COUNT(*) AS count FROM sample_parent').get()?.count).toBe(0);
});
test('committed data survives close and reopen', () => {
  database.exec('BEGIN');
  database.prepare('INSERT INTO sample_parent VALUES (?, ?)').run(1, '重开后仍存在');
  database.exec('COMMIT');
  database.close();
  database = new DatabaseSync(file);
  expect(database.prepare('SELECT label FROM sample_parent WHERE id = ?').get(1)?.label).toBe('重开后仍存在');
});
test('WAL is actually enabled on a file database', () => {
  expect(database.prepare('PRAGMA journal_mode = WAL').get()?.journal_mode).toBe('wal');
  console.log(JSON.stringify({ sqliteVersion: database.prepare('SELECT sqlite_version() AS version').get()?.version, journalMode: 'wal', file }));
});
