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
  const input = { topic: '\u0000中文 "旧草稿"', requestId: randomUUID() };
  const discussionId = randomUUID(), time = new Date().toISOString();
  db.prepare("INSERT INTO discussions VALUES (?,?,4,'created',1,1,?,?,?)").run(discussionId,input.topic,input.requestId,time,time);
  db.prepare("INSERT INTO public_events VALUES (?,1,1,'discussion.status_changed',?,?)").run(discussionId,time,JSON.stringify({status:'created',stopReason:null,startedAt:null,endedAt:null,confirmedLineupRevision:null,summary:null}));
  const snapshot = { discussionId, topic: input.topic, expertCount: 4, status: 'created', version: 1, lastEventId: 1,
    createdAt: time, updatedAt: time, lineupRevision: 0, confirmedLineupRevision: null, transcriptVersion: 0,
    roles: [], utterances: [], synthesis: null, summary: null, lastNotice: null, stopReason: null, startedAt: null, endedAt: null };
  return { input, created: { discussionId, snapshot } };
}
it('001在空库只建立旧业务两表与迁移记录', () => {
  migrateDatabase(db, 1);
  expect(tables()).toEqual(['discussions', 'public_events', 'schema_migrations']);
  expect(db.prepare('SELECT id,name FROM schema_migrations').all()).toEqual([{ id: 1, name: '001_draft_baseline' }]);
  expect(db.prepare('PRAGMA table_info(discussions)').all().map(row => row.name)).not.toContain('current_generation_id');
});
it('001严格接管真实旧schema，所有行及事件完整保留', () => {
  const { created, input } = seed();
  const before = db.prepare('SELECT * FROM discussions').all();
  const events = db.prepare('SELECT * FROM public_events').all();
  migrateDatabase(db, 1);
  expect(db.prepare('SELECT * FROM discussions').all()).toEqual(before);
  expect(db.prepare('SELECT * FROM public_events').all()).toEqual(events);
  expect(db.prepare('SELECT topic,create_request_id FROM discussions WHERE id=?').get(created.discussionId)).toEqual({topic:input.topic,create_request_id:input.requestId});
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
  expect(db.prepare('SELECT topic FROM discussions WHERE id=?').get(created.discussionId)?.topic).toBe(created.snapshot.topic);
});
it('001记录checksum被改变或编号缺号时拒绝继续', () => {
  migrateDatabase(db, 1);
  const checksum=db.prepare('SELECT checksum FROM schema_migrations WHERE id=1').get()?.checksum;
  if(typeof checksum!=='string')throw new Error('missing checksum');
  db.prepare("UPDATE schema_migrations SET checksum = 'modified'").run();
  expect(() => migrateDatabase(db, 1)).toThrow('MIGRATION_HISTORY_MISMATCH');
  expect(() => assertCurrentSchema(db)).toThrow('MIGRATION_HISTORY_MISMATCH');
  db.prepare('UPDATE schema_migrations SET checksum=? WHERE id=1').run(checksum);
  db.prepare('UPDATE schema_migrations SET id=2 WHERE id=1').run();
  expect(()=>migrateDatabase(db,2)).toThrow('MIGRATION_HISTORY_MISMATCH');
});

it('002从空库依次建立两版本，仅必要表', () => {
  migrateDatabase(db, 2);
  expect(tables()).toEqual(['discussions', 'lineup_members', 'public_events', 'schema_migrations']);
  expect(db.prepare('SELECT id FROM schema_migrations ORDER BY id').all()).toEqual([{ id: 1 }, { id: 2 }]);
  assertCurrentSchema(db);
});
it('002升级真实旧草稿并保留旧19字段与原始事件，重开重复安全', () => {
  const { created, input } = seed();
  const events = db.prepare('SELECT * FROM public_events').all();
  migrateDatabase(db, 2);
  const rows = db.prepare('SELECT * FROM schema_migrations').all();
  expect(new DraftService(new SqliteDraftStore(db)).get(created.discussionId)).toEqual(created.snapshot);
  expect(db.prepare('SELECT * FROM public_events').all()).toEqual(events);
  expect(db.prepare('SELECT generation_version,lineup_revision,current_generation_id FROM discussions').get())
    .toEqual({ generation_version: 0, lineup_revision: 0, current_generation_id: null });
  db.close(); db = new DatabaseSync(path); migrateDatabase(db, 2); assertCurrentSchema(db);
  expect(db.prepare('SELECT * FROM schema_migrations').all()).toEqual(rows);
  expect(new DraftService(new SqliteDraftStore(db)).create(input).replayed).toBe(true);
});
it('002末尾完整性检查失败时，复制和版本登记整体回滚', () => {
  seed();
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare("INSERT INTO public_events VALUES ('missing',1,1,'discussion.status_changed','2026-09-16T00:00:00.000Z','{}')").run();
  const schema = db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
  const data = db.prepare('SELECT * FROM discussions').all();
  expect(() => migrateDatabase(db, 2)).toThrow('MIGRATION_INTEGRITY_FAILED');
  expect(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
  expect(db.prepare('SELECT * FROM discussions').all()).toEqual(data);
  expect(db.prepare('SELECT COUNT(*) AS n FROM public_events').get()?.n).toBe(2);
  expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
});
it('002复制遇到旧库损坏数据时中途失败也整体回滚',()=>{
  seed();db.exec('PRAGMA ignore_check_constraints=ON');db.prepare('UPDATE discussions SET expert_count=0').run();db.exec('PRAGMA ignore_check_constraints=OFF');
  const schema=db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all(),rows=db.prepare('SELECT * FROM discussions').all(),events=db.prepare('SELECT * FROM public_events').all();
  expect(()=>migrateDatabase(db,2)).toThrow();
  expect(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
  expect(db.prepare('SELECT * FROM discussions').all()).toEqual(rows);expect(db.prepare('SELECT * FROM public_events').all()).toEqual(events);
  expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
});
it('002成员复合外键、顺序和主持唯一、状态组合约束实际生效', () => {
  const { created } = seed(); migrateDatabase(db, 2);
  const id = created.discussionId, generation = randomUUID(), now = new Date().toISOString();
  db.prepare(`UPDATE discussions SET status='awaiting_confirmation',version=3,last_event_id=3,
    current_generation_id=?,generation_request_id=?,generation_version=1,generation_started_at=?,generation_finished_at=?,
    lineup_generation_id=?,lineup_revision=1 WHERE id=?`).run(generation, randomUUID(), now, now, generation, id);
  const insert = db.prepare('INSERT INTO lineup_members VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const member = [randomUUID(),id,generation,1,'moderator','主持','教育','主持人','中立','#193455',0,'主持',now];
  insert.run(...member);
  expect(() => insert.run(...[randomUUID(),...member.slice(1)])).toThrow();
  expect(() => insert.run(randomUUID(),id,randomUUID(),1,'expert','专家','教育','研究员','观察','#2157a5',1,'专家',now)).toThrow(/FOREIGN KEY/);
  expect(() => db.prepare("UPDATE discussions SET status='lineup_confirmed' WHERE id=?").run(id)).toThrow(/CHECK/);
  expect(() => db.prepare("UPDATE discussions SET status='running' WHERE id=?").run(id)).toThrow(/CHECK/);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
