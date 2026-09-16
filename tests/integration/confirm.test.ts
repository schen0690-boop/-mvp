import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { FakeRosterProvider, type FakeMode } from '../../src/providers/fake-roster.js';
const cleanup: (()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0)) await close();});
function setup(modes: FakeMode[]=['normal']) {
  const {db,path}=temporaryDatabase();initializeDatabase(db);
  const drafts=new DraftService(new SqliteDraftStore(db)), store=new SqliteLineupStore(db),provider=new FakeRosterProvider(modes);
  const service=new LineupService(store,provider); cleanup.push(async()=>{await service.close();db.close();});
  const id=drafts.create({topic:'确认',requestId:randomUUID()}).discussionId;
  return {db,path,drafts,store,service,provider,id};
}
it('confirms exact current version once, persists across reopen, and never starts a discussion',async()=>{
  const x=setup();const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle();
  const body={generationId:a.generationId,lineupRevision:1};const first=x.service.confirm(x.id,body);
  expect(first.replayed).toBe(false);
  expect(first.snapshot).toMatchObject({status:'lineup_confirmed',version:4,lastEventId:4,confirmedLineupRevision:1,startedAt:null,utterances:[],synthesis:null,summary:null});
  expect(first.snapshot.confirmedAt).toMatch(/^\d{4}-.*Z$/);
  expect(x.service.confirm(x.id,body)).toEqual({...first,replayed:true});
  expect(x.provider.calls).toHaveLength(1);
  const other=new DatabaseSync(x.path);
  try { expect(new DraftService(new SqliteDraftStore(other)).get(x.id)).toEqual(first.snapshot); } finally { other.close(); }
  expect(()=>x.service.confirm(x.id,{...body,lineupRevision:2})).toThrow('版本');
  expect(()=>x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId})).toThrow('当前状态');
});
it('rejects omitted, stale and cross-discussion generation/revision without changing ready state',async()=>{
  const x=setup();const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle(); const before=x.drafts.get(x.id);
  for(const body of [{lineupRevision:1},{generationId:a.generationId},{generationId:randomUUID(),lineupRevision:1},{generationId:a.generationId,lineupRevision:2}]) expect(()=>x.service.confirm(x.id,body)).toThrow();
  expect(x.drafts.get(x.id)).toEqual(before);
});
it('created, generating and failed cannot confirm; regenerate immediately invalidates previous pair',async()=>{
  const x=setup(['normal','few','few']);
  expect(()=>x.service.confirm(x.id,{generationId:randomUUID(),lineupRevision:1})).toThrow('尚未');
  const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});
  expect(()=>x.service.confirm(x.id,{generationId:a.generationId,lineupRevision:1})).toThrow('尚未');await x.service.idle();
  const b=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId});
  expect(()=>x.service.confirm(x.id,{generationId:a.generationId,lineupRevision:1})).toThrow();await x.service.idle();
  expect(()=>x.service.confirm(x.id,{generationId:a.generationId,lineupRevision:1})).toThrow('尚未');
  expect(()=>x.service.confirm(x.id,{generationId:b.generationId,lineupRevision:2})).toThrow('尚未');
});
it('confirm-first and regenerate-first races each allow only the winning transition',async()=>{
  const x=setup();const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle();
  x.service.confirm(x.id,{generationId:a.generationId,lineupRevision:1});
  expect(()=>x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId})).toThrow();
  const y=setup();const old=y.service.generate(y.id,{requestId:randomUUID(),expectedGenerationId:null});await y.service.idle();
  const next=y.service.generate(y.id,{requestId:randomUUID(),expectedGenerationId:old.generationId});await y.service.idle();
  expect(()=>y.service.confirm(y.id,{generationId:old.generationId,lineupRevision:1})).toThrow('版本');
  expect(y.service.confirm(y.id,{generationId:next.generationId,lineupRevision:2}).snapshot.status).toBe('lineup_confirmed');
});
it('confirmation event failure rolls back time and state, then exact request can succeed',async()=>{
  const x=setup();const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle(); const before=x.drafts.get(x.id);
  x.db.exec("CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN NEW.event_id=4 BEGIN SELECT RAISE(ABORT,'private SQL'); END");
  const body={generationId:a.generationId,lineupRevision:1};expect(()=>x.service.confirm(x.id,body)).toThrow('存储');
  expect(x.drafts.get(x.id)).toEqual(before);x.db.exec('DROP TRIGGER injected');expect(x.service.confirm(x.id,body).replayed).toBe(false);
});
it('startup recovery changes only interrupted generations and refuses partial recovery',async()=>{
  const x=setup(); const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle();x.service.confirm(x.id,{generationId:a.generationId,lineupRevision:1});
  const confirmed=x.drafts.get(x.id); const created=x.drafts.create({topic:'草稿',requestId:randomUUID()}).snapshot;
  const pending=x.drafts.create({topic:'遗留生成',requestId:randomUUID()}).discussionId;
  x.store.begin(pending,{requestId:randomUUID(),expectedGenerationId:null},randomUUID(),new Date().toISOString());
  x.db.exec("CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN json_extract(NEW.payload,'$.lastNotice.code')='LINEUP_INTERRUPTED' BEGIN SELECT RAISE(ABORT,'private'); END");
  expect(()=>x.service.recover()).toThrow('存储');expect(x.drafts.get(pending).status).toBe('generating_lineup');
  x.db.exec('DROP TRIGGER injected');x.service.recover();expect(x.drafts.get(pending).lastNotice?.code).toBe('LINEUP_INTERRUPTED');
  expect(x.drafts.get(x.id)).toEqual(confirmed);expect(x.drafts.get(created.discussionId)).toEqual(created);expect(x.provider.calls).toHaveLength(1);
});
