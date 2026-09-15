import { expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { temporaryDatabase } from '../helpers/database.js';

it('初始化创建草稿与公开事件两张必要业务表，并启用外键', () => {
  const { db } = temporaryDatabase();
  try {
    initializeDatabase(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(tables.map(row => row.name)).toEqual(['discussions', 'public_events']);
    expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
  } finally { db.close(); }
});
