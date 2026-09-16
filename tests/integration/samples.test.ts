import {SqliteLineupStore} from '../../src/db/sqlite-lineup.js';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {temporaryDatabase} from '../helpers/database.js';
import {initializeDatabase} from '../../src/db/database.js';
import {DraftService} from '../../src/domain/drafts.js';
import {SqliteDraftStore} from '../../src/db/sqlite-drafts.js';
import {importSamples} from '../../src/import-samples.js';
import {samples} from '../../src/sample-data.js';
import {parseRoster,colors} from '../../src/domain/lineup.js';
it('五组不同话题与完整预置阵容经过系统赋值，待用户确认且不运行',()=>{
 const {db}=temporaryDatabase();try{initializeDatabase(db);const ids=importSamples(db);expect(ids).toHaveLength(5);expect(new Set(samples.map(s=>s.topic)).size).toBe(5);
 const service=new DraftService(new SqliteDraftStore(db));for(const id of ids){const s=service.get(id);expect(s.status).toBe('awaiting_confirmation');expect(s.confirmedAt).toBeNull();expect(s.utterances).toEqual([]);expect(s.roles).toHaveLength(s.expertCount+1);expect(s.topic).toContain('预置样例');expect(s.roles.every((r,i)=>r.color===colors[i]&&r.displayOrder===i)).toBe(true);expect(s.roles.every(r=>r.name.includes('虚构'))).toBe(true);}for(const s of samples)expect(parseRoster(JSON.stringify({roles:s.roles}),s.expertCount)).toHaveLength(s.expertCount+1);
 }finally{db.close();}
});
it('重复导入不堆数据、不改用户记录或已确认样例',()=>{const {db}=temporaryDatabase();try{initializeDatabase(db);const service=new DraftService(new SqliteDraftStore(db));const user=service.create({topic:'用户话题',expertCount:1,requestId:randomUUID()});const ids=importSamples(db);const first=service.get(ids[0]!);new SqliteLineupStore(db).confirm(first.discussionId,{generationId:first.lineupGeneration!.generationId,lineupRevision:first.lineupRevision},new Date().toISOString());const before=JSON.stringify(service.list('all'));expect(importSamples(db)).toEqual(ids);expect(JSON.stringify(service.list('all'))).toBe(before);expect(service.get(user.discussionId)).toEqual(user.snapshot);expect(service.list('all').items).toHaveLength(6);}finally{db.close();}});
it('阵容写入失败整批回滚，不留下半个样例及事件',()=>{const {db}=temporaryDatabase();try{initializeDatabase(db);db.exec("CREATE TRIGGER sample_fault BEFORE INSERT ON lineup_members BEGIN SELECT RAISE(ABORT,'test fault'); END");expect(()=>importSamples(db)).toThrow();expect(db.prepare('SELECT count(*) n FROM discussions').get()?.n).toBe(0);expect(db.prepare('SELECT count(*) n FROM public_events').get()?.n).toBe(0);}finally{db.close();}});
