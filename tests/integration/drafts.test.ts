import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { DraftService } from '../../src/domain/drafts.js';
import { temporaryDatabase } from '../helpers/database.js';

let db: DatabaseSync;
let path: string;
let service: DraftService;
const input = (topic = '如何改善中文教学？') => ({ topic, requestId: randomUUID() });
beforeEach(() => {
  ({ db, path } = temporaryDatabase());
  initializeDatabase(db);
  service = new DraftService(new SqliteDraftStore(db));
});
afterEach(() => db.close());

describe('真实SQLite草稿业务', () => {
  it('合法话题中的JSON转义空字符按码点处理并完整读回', () => {
    const topic = '\u0000中文';
    const created = service.create(input(topic));
    expect(service.get(created.discussionId).topic).toBe(topic);
  });
  it('中文创建和单条读取，系统初态与公开白名单完整', () => {
    const before = Date.now();
    const created = service.create(input('  中文  "教育"与\'就业\'  '));
    const snapshot = created.snapshot;
    expect(created.replayed).toBe(false);
    expect(created.discussionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snapshot).toEqual({
      discussionId: created.discussionId, topic: '中文  "教育"与\'就业\'', expertCount: 4,
      status: 'created', version: 1, lastEventId: 1, lineupRevision: 0, confirmedLineupRevision: null,
      transcriptVersion: 0, roles: [], utterances: [], synthesis: null, summary: null,
      lastNotice: null, stopReason: null, startedAt: null, endedAt: null,
      createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt
    });
    expect(snapshot.createdAt).toBe(new Date(snapshot.createdAt).toISOString());
    expect(Date.parse(snapshot.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(snapshot.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(service.get(created.discussionId)).toEqual(snapshot);
  });
  it.each([1, 8])('人数边界 %s 可以持久化', expertCount => {
    const created = service.create({ ...input(), expertCount });
    expect(service.get(created.discussionId).expertCount).toBe(expertCount);
  });
  it('非法输入和系统字段覆盖不得留下记录或事件', () => {
    expect(() => service.create({ ...input(), expertCount: null })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => service.create({ ...input(), status: 'running' })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM public_events').get()?.count).toBe(0);
  });
  it('同话题可创建超过两条独立草稿，读取互不串数据', () => {
    const drafts = Array.from({ length: 4 }, (_, i) => service.create({ ...input('同一话题'), expertCount: i + 1 }));
    expect(new Set(drafts.map(draft => draft.discussionId)).size).toBe(4);
    for (const [i, draft] of drafts.entries()) expect(service.get(draft.discussionId).expertCount).toBe(i + 1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(4);
  });
  it('UUID存在性查询与格式校验分开', () => {
    expect(() => service.get(randomUUID())).toThrowError(expect.objectContaining({ code: 'NOT_FOUND', status: 404 }));
    expect(() => service.get('bad-id')).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT', status: 400 }));
  });
  it('引号和SQL形态话题只是数据', () => {
    const topic = "中文'); DROP TABLE discussions; -- \"引号\"";
    const created = service.create(input(topic));
    expect(service.get(created.discussionId).topic).toBe(topic);
    expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(1);
  });
  it('关闭重开后通过业务层读取，并保持创建幂等', () => {
    const request = input();
    const created = service.create(request);
    db.close();
    db = new DatabaseSync(path);
    initializeDatabase(db);
    service = new DraftService(new SqliteDraftStore(db));
    expect(service.get(created.discussionId)).toEqual(created.snapshot);
    expect(service.create(request)).toEqual({ ...created, replayed: true });
  });
  it('重复初始化保留已提交记录和事件', () => {
    const created = service.create(input());
    initializeDatabase(db);
    initializeDatabase(db);
    expect(service.get(created.discussionId)).toEqual(created.snapshot);
    expect(db.prepare('SELECT COUNT(*) AS count FROM public_events').get()?.count).toBe(1);
  });
  it('规范化相同输入和requestId重放，不新增事件', () => {
    const request = input('  中文话题 ');
    const created = service.create(request);
    expect(service.create({ ...request, topic: '中文话题', expertCount: 4 })).toEqual({ ...created, replayed: true });
    expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM public_events').get()?.count).toBe(1);
  });
  it('同requestId不同话题或人数产生409，不修改原记录', () => {
    const request = input();
    const created = service.create(request);
    for (const changed of [{ ...request, topic: '另一个话题' }, { ...request, expertCount: 8 }]) {
      expect(() => service.create(changed)).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT', status: 409 }));
    }
    expect(service.get(created.discussionId)).toEqual(created.snapshot);
  });
  it('创建与首条公开状态事件对应，载荷无内部字段', () => {
    const created = service.create(input());
    const event = db.prepare('SELECT * FROM public_events WHERE discussion_id = ?').get(created.discussionId);
    expect(event).toEqual({ discussion_id: created.discussionId, event_id: 1, data_version: 1,
      type: 'discussion.status_changed', occurred_at: created.snapshot.createdAt, payload: expect.any(String) });
    expect(JSON.parse(String(event?.payload))).toEqual({ status: 'created', stopReason: null,
      startedAt: null, endedAt: null, confirmedLineupRevision: null, summary: null });
  });
  it('事件插入故障必须回滚草稿，移除故障后同请求可重试', () => {
    db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON public_events BEGIN SELECT RAISE(ABORT, 'controlled event failure'); END");
    const request = input();
    expect(() => service.create(request)).toThrow('controlled event failure');
    expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM public_events').get()?.count).toBe(0);
    db.exec('DROP TRIGGER reject_event');
    expect(service.create(request).replayed).toBe(false);
  });
});
