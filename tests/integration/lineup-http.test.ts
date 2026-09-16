import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { isObject } from '../../src/domain/input.js';
import { FakeRosterProvider, type FakeResponse } from '../../src/providers/fake-roster.js';
import { ProviderError } from '../../src/providers/roster.js';
import { createApp } from '../../src/http/app.js';
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
async function setup(responses:FakeResponse[]=['normal'],capacity=4){
  const {db}=temporaryDatabase();initializeDatabase(db);const drafts=new DraftService(new SqliteDraftStore(db));
  const provider=new FakeRosterProvider(responses),service=new LineupService(new SqliteLineupStore(db),provider,{capacity});
  const server=createApp(drafts,()=>{},service).listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Expected TCP');
  const base=`http://127.0.0.1:${address.port}/api/discussions`;
  cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await service.close();db.close();});
  const input={topic:'HTTP阵容 中文',requestId:randomUUID()},created=drafts.create(input);
  const post=(path:string,body:unknown,headers:Record<string,string>={'Content-Type':'application/json'})=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  return {db,drafts,provider,service,base,post,id:created.discussionId,input};
}
async function json(response:Response){const body:unknown=await response.json();if(!isObject(body))throw new Error('Expected JSON object');return body;}
async function error(response:Response,status:number,code:string){
  expect(response.status).toBe(status);const body=await json(response);
  expect(body).toEqual({error:{code,message:expect.any(String),retryable:status>=500||status===429,action:status>=500||status===429?'try_again':'none',requestId:expect.any(String)}});
  expect(JSON.stringify(body)).not.toMatch(/private|SELECT|INSERT|SQLITE|stack|\.sqlite|reasoning|providerConfig/i);
}
it('real Express returns captured 202, GET ready, creation replay current snapshot, and concurrent confirm only once',async()=>{
  const x=await setup();const request={requestId:randomUUID(),expectedGenerationId:null};
  const accepted=await x.post(`/${x.id}/lineup`,request);expect(accepted.status).toBe(202);
  expect(await json(accepted)).toMatchObject({discussionId:x.id,replayed:false,generationVersion:1,snapshot:{status:'generating_lineup'}});
  await x.service.idle();const ready=x.drafts.get(x.id);expect(await json(await fetch(`${x.base}/${x.id}`))).toEqual(ready);
  const replay=await x.post(`/${x.id}/lineup`,request);expect(replay.status).toBe(200);expect(await json(replay)).toMatchObject({replayed:true,snapshot:ready});
  const creation=await x.post('',x.input);expect(creation.status).toBe(200);expect(await json(creation)).toMatchObject({replayed:true,snapshot:ready});
  const body={generationId:ready.lineupGeneration?.generationId,lineupRevision:1};
  const confirmed=await Promise.all([x.post(`/${x.id}/lineup/confirm`,body),x.post(`/${x.id}/lineup/confirm`,body)]);
  expect(confirmed.map(r=>r.status)).toEqual([200,200]);const payloads=await Promise.all(confirmed.map(json));
  expect(payloads.map(p=>p.replayed).sort()).toEqual([false,true]);
  expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_confirmed',version:4,startedAt:null,utterances:[],synthesis:null});
  await error(await x.post(`/${x.id}/lineup`,request),409,'INVALID_STATE');
});
it('input/JSON/origin/type/not-found boundaries return safe 400/404',async()=>{
  const x=await setup();
  await error(await x.post(`/${x.id}/lineup`,{}),400,'INVALID_INPUT');
  await error(await x.post(`/${x.id}/lineup/confirm`,{generationId:randomUUID(),lineupRevision:'1'}),400,'INVALID_INPUT');
  await error(await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:null,force:true}),400,'INVALID_INPUT');
  await error(await x.post(`/${randomUUID()}/lineup`,{requestId:randomUUID(),expectedGenerationId:null}),404,'NOT_FOUND');
  await error(await x.post('/bad-id/lineup',{requestId:randomUUID(),expectedGenerationId:null}),400,'INVALID_INPUT');
  await error(await fetch(`${x.base}/${x.id}/lineup`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'}),400,'INVALID_INPUT');
  await error(await x.post(`/${x.id}/lineup`,{}, {'Content-Type':'text/plain'}),400,'INVALID_INPUT');
  await error(await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:null},{'Content-Type':'application/json',Origin:'https://outside.invalid'}),400,'INVALID_INPUT');
});
it('generating replay is 202; competing command 409; full capacity 429 leaves other draft untouched',async()=>{
  const x=await setup(['timeout'],1);const body={requestId:randomUUID(),expectedGenerationId:null};
  expect((await x.post(`/${x.id}/lineup`,body)).status).toBe(202);
  const replay=await x.post(`/${x.id}/lineup`,body);expect(replay.status).toBe(202);expect(await json(replay)).toMatchObject({replayed:true});
  await error(await x.post(`/${x.id}/lineup`,{...body,requestId:randomUUID()}),409,'GENERATION_IN_PROGRESS');
  await error(await x.post(`/${x.id}/lineup/confirm`,{generationId:x.drafts.get(x.id).lineupGeneration?.generationId,lineupRevision:1}),409,'LINEUP_NOT_READY');
  const other=x.drafts.create({topic:'另一草稿',requestId:randomUUID()});
  await error(await x.post(`/${other.discussionId}/lineup`,{requestId:randomUUID(),expectedGenerationId:null}),429,'CAPACITY_REACHED');
  expect(x.drafts.get(other.discussionId).status).toBe('created');expect(x.provider.calls).toHaveLength(1);
});
it.each<{response:FakeResponse;code:string}>([
  {response:'invalid-structure',code:'LINEUP_INVALID_STRUCTURE'},{response:'few',code:'LINEUP_INVALID_MEMBERS'},
  {response:'configuration',code:'LINEUP_PROVIDER_CONFIGURATION'},
  {response:async()=>{throw new Error('private SQL stack providerConfig');},code:'LINEUP_PROVIDER_UNAVAILABLE'},
  {response:async()=>{throw new ProviderError('timeout');},code:'LINEUP_TIMEOUT'},
  {response:async()=>JSON.stringify({roles:[],reasoning:'private hidden'}),code:'LINEUP_INVALID_STRUCTURE'}
])('accepted provider error becomes safe snapshot $code with GET200',async({response,code})=>{
  const x=await setup([response]);expect((await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:null})).status).toBe(202);
  await x.service.idle();const get=await fetch(`${x.base}/${x.id}`);expect(get.status).toBe(200);const body=await json(get);
  expect(body).toMatchObject({status:'lineup_generation_failed',roles:[],lastNotice:{code}});
  expect(JSON.stringify(body)).not.toMatch(/private|stack|SQL|reasoning|providerConfig/);
});
it('new generation blocks old confirm and old idempotency key; matching current confirm succeeds',async()=>{
  const x=await setup();const first={requestId:randomUUID(),expectedGenerationId:null};await x.post(`/${x.id}/lineup`,first);await x.service.idle();
  const a=x.drafts.get(x.id).lineupGeneration?.generationId;
  await error(await x.post(`/${x.id}/lineup`,{...first,expectedGenerationId:a}),409,'IDEMPOTENCY_CONFLICT');
  await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:a});await x.service.idle();
  await error(await x.post(`/${x.id}/lineup`,first),409,'STALE_GENERATION');
  await error(await x.post(`/${x.id}/lineup/confirm`,{generationId:a,lineupRevision:1}),409,'STALE_LINEUP');
  const ready=x.drafts.get(x.id);expect((await x.post(`/${x.id}/lineup/confirm`,{generationId:ready.lineupGeneration?.generationId,lineupRevision:2})).status).toBe(200);
});
it('known begin storage failure is 503; accepted double-write failure blocks GET with 503',async()=>{
  const x=await setup();x.db.exec("CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN NEW.event_id=2 BEGIN SELECT RAISE(ABORT,'private SQL'); END");
  await error(await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:null}),503,'STORAGE_UNAVAILABLE');
  x.db.exec("DROP TRIGGER injected; CREATE TRIGGER injected BEFORE INSERT ON public_events WHEN NEW.event_id=3 BEGIN SELECT RAISE(ABORT,'private SQL'); END");
  expect((await x.post(`/${x.id}/lineup`,{requestId:randomUUID(),expectedGenerationId:null})).status).toBe(202);await x.service.idle();
  await error(await fetch(`${x.base}/${x.id}`),503,'STORAGE_UNAVAILABLE');await error(await fetch(x.base+'?status=all'),503,'STORAGE_UNAVAILABLE');
});
