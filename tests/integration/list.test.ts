import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { DraftService } from '../../src/domain/drafts.js';
import { temporaryDatabase } from '../helpers/database.js';

let db: DatabaseSync;
let service: DraftService;
beforeEach(() => {
  ({ db } = temporaryDatabase());
  initializeDatabase(db);
  service = new DraftService(new SqliteDraftStore(db));
});
afterEach(() => db.close());

it('空数据库返回合法空列表', () => {
  expect(service.list()).toEqual({ items: [] });
  expect(service.list('all')).toEqual({ items: [] });
});
it('默认active不将草稿标成运行中，all明确返回草稿', () => {
  const created = service.create({ topic: '草稿', requestId: randomUUID() });
  expect(service.list()).toEqual({ items: [] });
  expect(service.list('all')).toEqual({ items: [{ discussionId: created.discussionId, topic: '草稿',
    expertCount: 4, status: 'created', version: 1, updatedAt: created.snapshot.updatedAt }] });
});
it('按updatedAt降序，同时间按discussionId升序，列表内容互相独立', () => {
  const times = ['2026-09-15T01:00:00.000Z', '2026-09-15T02:00:00.000Z', '2026-09-15T02:00:00.000Z'];
  const records = times.map((timestamp, index) => {
    const writer = new DraftService(new SqliteDraftStore(db), () => new Date(timestamp));
    return writer.create({ topic: `话题${index}`, expertCount: index + 1, requestId: randomUUID() }).snapshot;
  });
  const expected = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.discussionId.localeCompare(b.discussionId))
    .map(record => ({ discussionId: record.discussionId, topic: record.topic, expertCount: record.expertCount,
      status: record.status, version: record.version, updatedAt: record.updatedAt }));
  expect(service.list('all').items).toEqual(expected);
});
it.each(['created', '', null, ['all'], 1].map(status => ({ status })))('拒绝非法列表过滤 $status', ({ status }) => {
  expect(() => service.list(status)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
});
