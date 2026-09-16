import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { DeepSeekRosterProvider,type RequestMetric } from '../../src/providers/deepseek.js';
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
const roles=[{role:'moderator',name:'主持人',profession:'沟通',title:'主持',stance:'中立'},...Array.from({length:4},(_,i)=>({role:'expert',name:`专家${i}`,profession:`方向${i}`,title:'研究员',stance:`关注点${i}`}))];
function response(content=JSON.stringify({roles}),finish='stop'){return Response.json({choices:[{index:0,finish_reason:finish,message:{role:'assistant',content,reasoning_content:'PRIVATE_REASONING'}}]});}
function setup(send:typeof fetch){const {db}=temporaryDatabase();initializeDatabase(db);const drafts=new DraftService(new SqliteDraftStore(db)),store=new SqliteLineupStore(db),metrics:RequestMetric[]=[];
  const service=new LineupService(store,new DeepSeekRosterProvider({baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'pipeline-dummy-secret',maxTokens:4096},send,m=>metrics.push(m)));
  cleanup.push(async()=>{await service.close();db.close();});const id=drafts.create({topic:'AI 如何改善教育？',requestId:randomUUID()}).discussionId;
  return{db,drafts,store,service,metrics,id,start:()=>service.generate(id,{requestId:randomUUID(),expectedGenerationId:null})};}
it('real adapter passes existing validators, commits and confirms; first success one request, no reasoning leaked',async()=>{
  const send=vi.fn(async()=>response());const x=setup(send);x.start();await x.service.idle();const ready=x.drafts.get(x.id);expect(ready.status).toBe('awaiting_confirmation');expect(ready.roles).toHaveLength(5);expect(ready.roles[0]?.color).toBe('#193455');expect(send).toHaveBeenCalledTimes(1);
  x.service.confirm(x.id,{generationId:ready.lineupGeneration!.generationId,lineupRevision:ready.lineupRevision});expect(x.drafts.get(x.id).status).toBe('lineup_confirmed');
  expect(JSON.stringify([x.drafts.get(x.id),x.metrics,x.db.prepare('SELECT payload FROM public_events').all()])).not.toMatch(/PRIVATE_REASONING|pipeline-dummy-secret/);
});
it.each([400,401,402,422])('upstream %i stops after one call without Fake fallback',async status=>{const send=vi.fn(async()=>new Response('PRIVATE',{status}));const x=setup(send);x.start();await x.service.idle();expect(send).toHaveBeenCalledTimes(1);expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',roles:[],lastNotice:{code:'LINEUP_PROVIDER_CONFIGURATION'}});});
it.each(['content_filter','tool_calls','aborted'])('finish %s must not be automatically retried',async finish=>{const send=vi.fn(async()=>response(undefined,finish));const x=setup(send);x.start();await x.service.idle();expect(send).toHaveBeenCalledTimes(1);expect(x.drafts.get(x.id).status).toBe('lineup_generation_failed');});
it('invalid output repair shares two-call budget and safe rule feedback only',async()=>{const send=vi.fn<typeof fetch>().mockResolvedValueOnce(response('{"roles":[]}')).mockResolvedValueOnce(response());const x=setup(send);x.start();await x.service.idle();expect(send).toHaveBeenCalledTimes(2);expect(x.drafts.get(x.id).status).toBe('awaiting_confirmation');const body=JSON.parse(String(send.mock.calls[1]?.[1]?.body));expect(JSON.parse(body.messages[1].content).repairIssues).toEqual([{path:'roles',rule:'LINEUP_INVALID_MEMBERS'}]);});
it.each(['not-json','{"roles":[]}','{"roles":[{"role":"expert"}]}'])('transport then bad body %s consumes only two calls and persists no partial members',async raw=>{const send=vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('PRIVATE')).mockResolvedValueOnce(response(raw));const x=setup(send);x.start();await x.service.idle();expect(send).toHaveBeenCalledTimes(2);expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',roles:[]});});
it('stale failure must not launch another outbound request',async()=>{
  let reject!:(error:Error)=>void;const send=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise((_yes,no)=>{reject=no;})).mockResolvedValue(response());
  const x=setup(send);const a=x.start();x.store.fail(x.id,a,'LINEUP_TIMEOUT',new Date().toISOString());const b=x.store.begin(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId},randomUUID(),new Date().toISOString());
  reject(new Error('PRIVATE'));await x.service.idle();expect(send).toHaveBeenCalledTimes(1);expect(x.drafts.get(x.id).lineupGeneration?.generationId).toBe(b.generationId);
});
