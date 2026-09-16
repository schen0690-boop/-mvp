import { expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { temporaryDatabase } from '../helpers/database.js';

it('初始化迁移至003，保留旧表并新增必要成员/迁移表及外键', () => {
  const { db } = temporaryDatabase();
  try {
    initializeDatabase(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(tables.map(row => row.name)).toEqual(['discussions', 'finding_evidence', 'findings', 'lineup_members', 'public_events', 'role_public_states', 'schema_migrations', 'utterances']);
    expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
  } finally { db.close(); }
});
