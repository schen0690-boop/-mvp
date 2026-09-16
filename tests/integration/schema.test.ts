import { expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { temporaryDatabase } from '../helpers/database.js';

it('初始化迁移至002，保留旧表并新增必要成员/迁移表及外键', () => {
  const { db } = temporaryDatabase();
  try {
    initializeDatabase(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(tables.map(row => row.name)).toEqual(['discussions', 'lineup_members', 'public_events', 'schema_migrations']);
    expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
  } finally { db.close(); }
});
