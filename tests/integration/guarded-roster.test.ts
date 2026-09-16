import { expect,it,vi } from 'vitest';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService } from '../../src/domain/lineup-service.js';
import { mkdirSync,mkdtempSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LiveAuthorization } from '../../src/live/authorization.js';
import { GuardedRosterProvider } from '../../src/live/guarded-roster.js';
import { DeepSeekRosterProvider } from '../../src/providers/deepseek.js';
import { FakeRosterProvider } from '../../src/providers/fake-roster.js';
const input={discussionId:randomUUID(),topic:'AI 如何改善教育？',expertCount:4,constraints:''};
const ctx=()=>({generationId:randomUUID(),signal:new AbortController().signal,deadline:performance.now()+30000});
function auth(){mkdirSync('.tmp/stage-4d',{recursive:true});return new LiveAuthorization(mkdtempSync(resolve('.tmp/stage-4d/guarded-')));}
it('first domain-valid real-adapter result closes authorization; another call never reaches transport',async()=>{
  const a=auth(),context=ctx();const raw=await new FakeRosterProvider().generateRoster(input,context);let calls=0;
  const provider=new DeepSeekRosterProvider({baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'guard-dummy',maxTokens:4096},async()=>{calls++;expect(a.count).toBe(1);return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:raw}}]});},m=>a.record(m.attempt??0,m));
  const guarded=new GuardedRosterProvider(provider,a);expect(await guarded.generateRoster(input,context)).toBe(raw);expect(a.closed).toBe(true);await expect(guarded.generateRoster(input,context)).rejects.toThrow();expect(calls).toBe(1);
});
it('invalid body permits exactly one domain repair then terminal closure across wrapper restart',async()=>{
  const a=auth(),context=ctx(),fake=new FakeRosterProvider(['few','normal']);const first=new GuardedRosterProvider(fake,a);await expect(first.generateRoster(input,context)).rejects.toThrow('LINEUP_INVALID_MEMBERS');expect(a.closed).toBe(false);
  const second=new GuardedRosterProvider(fake,new LiveAuthorization(a.directory));await second.generateRoster(input,context);expect(a.count).toBe(2);expect(a.closed).toBe(true);await expect(second.generateRoster(input,context)).rejects.toThrow();expect(fake.calls).toHaveLength(2);
});
it('deterministic upstream error closes unused remainder without Fake fallback',async()=>{
  const a=auth(),fake=new FakeRosterProvider(['configuration','normal']);const guarded=new GuardedRosterProvider(fake,a);await expect(guarded.generateRoster(input,ctx())).rejects.toMatchObject({kind:'configuration'});expect(a.count).toBe(1);expect(a.closed).toBe(true);expect(fake.calls).toHaveLength(1);
});
it('service attempt timeout cancels socket but preserves the one remaining authorized attempt',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const a=auth(),{db}=temporaryDatabase();initializeDatabase(db);const drafts=new DraftService(new SqliteDraftStore(db));let calls=0;let resolveSecond!:(value:Response)=>void;
  const provider=new DeepSeekRosterProvider({baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'timeout-dummy',maxTokens:4096},async(_url,options)=>{
    calls++;if(calls===1)return new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));return new Promise(resolve=>{resolveSecond=resolve;});
  },metric=>a.record(metric.attempt??0,metric));
  const service=new LineupService(new SqliteLineupStore(db),new GuardedRosterProvider(provider,a));
  try {
    const id=drafts.create({topic:input.topic,requestId:randomUUID()}).discussionId;service.generate(id,{requestId:randomUUID(),expectedGenerationId:null});
    await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(2);expect(a.closed).toBe(false);
    const raw=await new FakeRosterProvider().generateRoster(input,ctx());resolveSecond(Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:raw}}]}));await service.idle();expect(drafts.get(id).status).toBe('awaiting_confirmation');expect(a.closed).toBe(true);
    expect(JSON.parse(readFileSync(resolve(a.directory,'result-1.json'),'utf8'))).toMatchObject({attempt:1,outcome:'timeout'});
    expect(JSON.parse(readFileSync(resolve(a.directory,'result-2.json'),'utf8'))).toMatchObject({attempt:2,outcome:'content_received'});
  }finally{await service.close();db.close();vi.useRealTimers();}
});
