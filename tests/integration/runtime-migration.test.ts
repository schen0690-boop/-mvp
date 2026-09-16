import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { temporaryDatabase } from '../helpers/database.js';
import { migrateDatabase, assertCurrentSchema } from '../../src/db/migrations.js';
import { DraftService } from '../../src/domain/drafts.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { FakeRosterProvider } from '../../src/providers/fake-roster.js';
const connections: DatabaseSync[]=[];
afterEach(()=>{for(const db of connections.splice(0))db.close();});
function old(){const {db,path}=temporaryDatabase();connections.push(db);db.exec(readFileSync(new URL('../fixtures/schema-v2.sql',import.meta.url),'utf8'));return {db,path};}
it('空库建立001→002→003及四张讨论表',()=>{
 const {db}=temporaryDatabase();connections.push(db);migrateDatabase(db,3);
 expect(db.prepare('SELECT id FROM schema_migrations').all()).toEqual([{id:1},{id:2},{id:3}]);
 for(const name of ['utterances','findings','finding_evidence','role_public_states'])expect(db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(name)).toBeDefined();
});
it('真实002确认组、草稿、幂等字段及事件完整保留，重复与重开安全',async()=>{
 const {db,path}=old();const drafts=new DraftService(new SqliteDraftStore(db));
 const created=drafts.create({topic:'中文 "旧阵容"',requestId:randomUUID()});
 drafts.create({topic:'独立草稿',requestId:randomUUID()});
 const lineup=new LineupService(new SqliteLineupStore(db),new FakeRosterProvider());
 const gen=lineup.generate(created.discussionId,{requestId:randomUUID(),expectedGenerationId:null});await lineup.idle();lineup.confirm(created.discussionId,{generationId:gen.generationId,lineupRevision:gen.generationVersion});
 const before=db.prepare('SELECT * FROM discussions ORDER BY id').all(),members=db.prepare('SELECT * FROM lineup_members ORDER BY member_id').all(),events=db.prepare('SELECT * FROM public_events ORDER BY discussion_id,event_id').all();
 migrateDatabase(db,3);migrateDatabase(db,3);assertCurrentSchema(db);
 const columns=Object.keys(before[0]!).join(',');expect(db.prepare(`SELECT ${columns} FROM discussions ORDER BY id`).all()).toEqual(before);
 expect(db.prepare('SELECT * FROM lineup_members ORDER BY member_id').all()).toEqual(members);expect(db.prepare('SELECT * FROM public_events ORDER BY discussion_id,event_id').all()).toEqual(events);
 const reopened=new DatabaseSync(path);connections.push(reopened);migrateDatabase(reopened,3);assertCurrentSchema(reopened);
 expect(reopened.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 expect(()=>db.prepare("INSERT INTO role_public_states VALUES ('missing','missing','idle',NULL,NULL,'now')").run()).toThrow(/FOREIGN KEY/);
});
it('003末尾外键失败回滚全部DDL与旧数据',()=>{
 const {db}=old();db.exec('PRAGMA foreign_keys=OFF');db.prepare("INSERT INTO public_events VALUES ('missing',1,1,'discussion.status_changed','now','{}')").run();
 const before=db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
 expect(()=>migrateDatabase(db,3)).toThrow('MIGRATION_INTEGRITY_FAILED');
 expect(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(before);expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(2);
});
it('未知002对象拒绝且没有迁移003',()=>{
 const {db}=old();db.exec('CREATE TABLE unknown(x TEXT)');expect(()=>migrateDatabase(db,3)).toThrow('SCHEMA_MISMATCH');expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(2);
});
