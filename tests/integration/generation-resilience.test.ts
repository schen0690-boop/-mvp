import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { FakeRosterProvider, type FakeResponse } from '../../src/providers/fake-roster.js';
const cleanup: (()=>Promise<void>)[]=[];
afterEach(async()=>{ for(const close of cleanup.splice(0)) await close(); vi.useRealTimers(); });
function setup(responses: FakeResponse[]=['normal']) {
  const {db,path}=temporaryDatabase(); initializeDatabase(db);
  const drafts=new DraftService(new SqliteDraftStore(db)); const store=new SqliteLineupStore(db);
  const provider=new FakeRosterProvider(responses); const diagnostics: {code:string}[]=[];
  const service=new LineupService(store,provider,{capacity:1,diagnose:e=>diagnostics.push(e)});
  cleanup.push(async()=>{await service.close();db.close();});
  const id=drafts.create({topic:'隔离与超时',requestId:randomUUID()}).discussionId;
  return {db,path,drafts,store,provider,service,id,diagnostics};
}
it.each(['success','failure'])('30s attempts share 60s deadline; late A %s cannot overwrite B or emit an event', async outcome=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const releases: ((value:string)=>void)[]=[];
  const rejections: ((reason:Error)=>void)[]=[];
  const delayed: FakeResponse=()=>new Promise((resolve,reject)=>{releases.push(resolve);rejections.push(reject);});
  const x=setup([delayed,delayed,'normal']);
  const valid=await new FakeRosterProvider().generateRoster({discussionId:x.id,topic:'x',expertCount:4,constraints:'x'},{signal:new AbortController().signal,deadline:1});
  try {
    const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});
    await vi.advanceTimersByTimeAsync(60000);
    expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',lastNotice:{code:'LINEUP_TIMEOUT'}});
    expect(x.provider.calls).toHaveLength(2);
    const b=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId}); await x.service.idle();
    const before=x.drafts.get(x.id); expect(before.lineupGeneration?.generationId).toBe(b.generationId);
    if(outcome==='success') releases.forEach(resolve=>resolve(valid)); else rejections.forEach(reject=>reject(new Error('private late error')));
    await Promise.resolve(); await Promise.resolve();
    expect(x.drafts.get(x.id)).toEqual(before);
    expect(x.db.prepare('SELECT count(*) AS n FROM public_events').get()?.n).toBe(5);
    expect(x.diagnostics.some(e=>e.code==='STALE_GENERATION_RESULT')).toBe(true);
  } finally { releases.forEach(resolve=>resolve(valid)); }
});
it.each(['before','during'])('checks deadline %s the persistence transaction and leaves no partial success',async point=>{
  vi.useFakeTimers({toFake:['performance','setTimeout','clearTimeout']});
  const x=setup();const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});await x.service.idle();
  const roles=x.drafts.get(x.id).roles;
  const b=x.store.begin(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId},randomUUID(),new Date().toISOString());
  const deadline=performance.now()+1000;
  if(point==='before') await vi.advanceTimersByTimeAsync(1001);
  else {
    x.db.function('expire_test_clock',()=>{vi.advanceTimersByTime(1001);return 1;});
    x.db.exec('CREATE TRIGGER injected AFTER INSERT ON lineup_members WHEN NEW.display_order=4 BEGIN SELECT expire_test_clock(); END');
  }
  expect(x.store.complete(x.id,b,roles,new Date().toISOString(),deadline)).toBe(false);
  expect(x.drafts.get(x.id)).toMatchObject({status:'generating_lineup',version:4,lineupRevision:1,roles:[]});
  expect(x.db.prepare('SELECT generation_version FROM lineup_members').all().every(r=>r.generation_version===1)).toBe(true);
  expect(x.db.prepare('SELECT count(*) AS n FROM public_events').get()?.n).toBe(4);
  expect(x.store.fail(x.id,b,'LINEUP_TIMEOUT',new Date().toISOString())).toBe(true);
});
it.each(['member','event'])('persistence %s fault rolls back the entire lineup then records safe storage failure', async point=>{
  const x=setup();
  x.db.exec(point==='member' ? "CREATE TRIGGER injected BEFORE INSERT ON lineup_members WHEN NEW.display_order=2 BEGIN SELECT RAISE(ABORT,'private SQL path'); END" :
    "CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN json_extract(NEW.payload,'$.status')='awaiting_confirmation' BEGIN SELECT RAISE(ABORT,'private SQL path'); END");
  x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',version:3,lastNotice:{code:'LINEUP_STORAGE_FAILED'},roles:[],lineupRevision:0});
  expect(x.provider.calls).toHaveLength(1); expect(x.db.prepare('SELECT count(*) AS n FROM lineup_members').get()?.n).toBe(0);
  expect(x.db.prepare('SELECT count(*) AS n FROM public_events').get()?.n).toBe(3);
});
it('two storage failures block reads and commands; explicit restart recovery persists interrupted state', async()=>{
  const x=setup();
  x.db.exec("CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN NEW.event_id=3 BEGIN SELECT RAISE(ABORT,'private failure'); END");
  x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  expect(()=>x.service.assertAvailable(x.id)).toThrow('存储');
  expect(()=>x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null})).toThrow('存储');
  expect(x.drafts.get(x.id)).toMatchObject({status:'generating_lineup',version:2,roles:[]});
  x.db.exec('DROP TRIGGER injected');
  const recovered=new LineupService(x.store,new FakeRosterProvider()); recovered.recover();
  expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',version:3,lastNotice:{code:'LINEUP_INTERRUPTED'}});
  recovered.recover(); expect(x.drafts.get(x.id).version).toBe(3); await recovered.close();
});
it('a failed begin is 503, preserves created and releases capacity', async()=>{
  const x=setup(); x.db.exec("CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN NEW.event_id=2 BEGIN SELECT RAISE(ABORT,'private failure'); END");
  expect(()=>x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null})).toThrow('存储');
  expect(x.drafts.get(x.id).status).toBe('created'); expect(x.provider.calls).toHaveLength(0);
  x.db.exec('DROP TRIGGER injected'); x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  expect(x.drafts.get(x.id).status).toBe('awaiting_confirmation');
});
it('CAS rejects cross-discussion generation and stale failure without changing either snapshot', async()=>{
  const x=setup(); const second=x.drafts.create({topic:'另外一场',requestId:randomUUID()}).discussionId;
  const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  const before=x.drafts.get(x.id); const other=x.drafts.get(second);
  expect(x.store.complete(second,a,before.roles,new Date().toISOString())).toBe(false);
  expect(x.store.fail(x.id,a,'LINEUP_TIMEOUT',new Date().toISOString())).toBe(false);
  expect(x.drafts.get(x.id)).toEqual(before); expect(x.drafts.get(second)).toEqual(other);
});
