import { it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openConfiguredDatabase } from '../../src/runtime.js';
import { temporaryDatabase } from '../helpers/database.js';

it('启动拒绝未迁移旧库且不改变schema；显式初始化备份后升级', async () => {
  const { path, db } = temporaryDatabase();
  db.exec(readFileSync(new URL('../fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  db.close();
  expect(() => openConfiguredDatabase(path)).toThrow('MIGRATION_REQUIRED');
  const before = new DatabaseSync(path, { readOnly: true });
  expect(before.prepare("SELECT 1 FROM sqlite_schema WHERE name='schema_migrations'").get()).toBeUndefined();
  before.close();
  const { initializeConfiguredDatabase } = await import('../../src/runtime.js');
  await initializeConfiguredDatabase(path);
  const upgraded = openConfiguredDatabase(path); upgraded.close();
  const backups = readdirSync(dirname(path)).filter(name => name.includes('.backup-'));
  expect(backups).toHaveLength(1);
  const copy = new DatabaseSync(`${dirname(path)}/${backups[0]}`, { readOnly: true });
  expect(copy.prepare("SELECT 1 FROM sqlite_schema WHERE name='schema_migrations'").get()).toBeUndefined(); copy.close();
  await initializeConfiguredDatabase(path);
  expect(readdirSync(dirname(path)).filter(name => name.includes('.backup-'))).toEqual(backups);
});
it('启动缺失库不偷偷新建，显式初始化可建立新库', async () => {
  const { path, db } = temporaryDatabase(); db.close();
  const fresh = `${path}.new.sqlite`;
  expect(() => openConfiguredDatabase(fresh)).toThrow('MIGRATION_REQUIRED');
  expect(existsSync(fresh)).toBe(false);
  const { initializeConfiguredDatabase } = await import('../../src/runtime.js');
  await initializeConfiguredDatabase(fresh);
  const opened = openConfiguredDatabase(fresh); opened.close();
});
