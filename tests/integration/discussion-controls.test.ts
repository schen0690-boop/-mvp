import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {discussionFixture} from '../helpers/discussion.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
import {FakeRosterProvider} from '../../src/providers/fake-roster.js';
import {LimitedRosterProvider} from '../../src/providers/limited-roster.js';
import {CallLimiter} from '../../src/providers/call-limiter.js';
import {ProviderError} from '../../src/providers/roster.js';
import type {DiscussionProvider} from '../../src/providers/discussion.js';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.useRealTimers();});
function gate<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
async function fixture(n=4,hooks:Partial<DiscussionProvider>={}){const f=await discussionFixture(n),limiter=new CallLimiter(),service=new DiscussionService(f.store,new FakeDiscussionProvider(hooks),limiter);cleanup.push(async()=>{await service.close();f.db.close();});return {...f,service,limiter};}
it('阵容与讨论复用同一调用限制，取消排队阵容不会调用底层Provider',async()=>{
 const limiter=new CallLimiter(),hold=gate<void>(),controller=new AbortController();let calls=0;
 const work=[1,2,3,4].map((_,i)=>limiter.run(i<2?'a':'b',new AbortController().signal,Infinity,()=>hold.promise));
 const provider=new LimitedRosterProvider({generateRoster:async()=>{calls++;return '{}';}},limiter);
 const queued=provider.generateRoster({discussionId:'c',topic:'t',expertCount:4,constraints:''},{signal:controller.signal,deadline:Infinity});
 const rejected=expect(queued).rejects.toThrow('cancelled');controller.abort();await rejected;expect(calls).toBe(0);hold.resolve();await Promise.all(work);
 const normal=new LimitedRosterProvider(new FakeRosterProvider(),limiter);expect(await normal.generateRoster({discussionId:'c',topic:'t',expertCount:1,constraints:''},{signal:new AbortController().signal,deadline:Infinity})).toContain('moderator');
});
it('两场并行/第三场429，停止A不影响B，观察无额外调用',async()=>{
 const entered=gate<void>(),release=gate<unknown>();let calls=0;const normal=new FakeDiscussionProvider();
 const f=await fixture(1,{generateUtterance:async(i,c)=>{calls++;if(i.discussionId===f.id){entered.resolve();return release.promise;}return normal.generateUtterance(i,c);}});
 async function another(){const id=f.drafts.create({topic:'另一场',expertCount:1,requestId:randomUUID()}).discussionId;const g=f.lineup.generate(id,{requestId:randomUUID(),expectedGenerationId:null});await f.lineup.idle();f.lineup.confirm(id,{generationId:g.generationId,lineupRevision:g.generationVersion});return {id,input:{requestId:randomUUID(),generationId:g.generationId,lineupRevision:g.generationVersion}};}
 const b=await another(),c=await another();f.service.start(f.id,f.input);await entered.promise;f.service.start(b.id,b.input);
 expect(()=>f.service.start(c.id,c.input)).toThrow('容量');const before=calls;for(let i=0;i<5;i++){f.drafts.get(f.id);f.drafts.list('all');}expect(calls).toBe(before);
 f.service.stop(f.id,{});await f.service.idle();release.resolve({});expect(f.drafts.get(b.id)).toMatchObject({status:'completed',stopReason:'turn_limit'});expect(f.drafts.get(f.id).stopReason).toBe('user_requested');expect(f.limiter.pending).toBe(0);
});
it('单个角色失败可选其他有效角色，网络重试与修复共享两次',async()=>{
 const normal=new FakeDiscussionProvider();const attempts=new Map<string,number>();let broken='';
 const f=await fixture(2,{generateUtterance:async(i,c)=>{
  if(i.purpose==='expert'){if(!broken)broken=i.member.memberId;const key=c.taskId;attempts.set(key,(attempts.get(key)??0)+1);if(i.member.memberId===broken){if(c.attemptNo===1)throw new ProviderError('transport');return {sentences:['无句末'],replyToUtteranceIds:[]};}}
  return normal.generateUtterance(i,c);
 }});f.service.start(f.id,f.input);await f.service.idle();const s=f.drafts.get(f.id);expect(s.status).toBe('completed');expect(s.utterances.some(u=>u.roleId===broken)).toBe(false);expect(Math.max(...attempts.values())).toBe(2);expect(f.store.state(f.id)!.callsUsed).toBeLessThanOrEqual(112);
});
it('真实SQLite提交故障不留下半条发言，安全failed保留开场',async()=>{
 const normal=new FakeDiscussionProvider();const f=await fixture(1,{generateUtterance:async(i,c)=>{
  if(i.purpose==='expert')f.db.exec("CREATE TRIGGER reject_utterance BEFORE INSERT ON public_events WHEN NEW.type='utterance.created' BEGIN SELECT RAISE(ABORT,'SQL diagnostic not public'); END");return normal.generateUtterance(i,c);
 }});f.service.start(f.id,f.input);await f.service.idle();const s=f.drafts.get(f.id);expect(s).toMatchObject({status:'failed',transcriptVersion:1,lastNotice:{code:'RUNTIME_STORAGE_FAILED'}});expect(JSON.stringify(s)).not.toContain('SQL diagnostic');expect(f.limiter.active).toBe(0);
});
it('全部意愿超时只修复一次；关闭服务取消全部Fake任务与队列',async()=>{
 const f=await fixture(4,{assessIntent:async(_i,c)=>new Promise((_resolve,reject)=>{c.signal.addEventListener('abort',()=>reject(new ProviderError('cancelled')),{once:true});})});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});f.service.start(f.id,f.input);await vi.advanceTimersByTimeAsync(120000);await f.service.idle();expect(f.drafts.get(f.id).status).toBe('failed');expect(f.limiter.active).toBe(0);expect(f.limiter.pending).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('主持串联发言两次失败属于致命主持失败，不当成综合失败继续',async()=>{
 const normal=new FakeDiscussionProvider();const f=await fixture(2,{generateUtterance:async(i,c)=>{if(i.purpose==='bridge')throw new ProviderError('transport');return normal.generateUtterance(i,c);},extractSynthesis:async i=>{
  const expertIds=new Set(i.roles.filter(m=>m.role==='expert').map(m=>m.memberId));const evidence=new Map<string,string>();for(const u of i.utterances)if(expertIds.has(u.roleId))evidence.set(u.roleId,u.id);const ids=[...evidence.values()];
  return {items:ids.length<2?[]:[{kind:'disagreement',text:'两种取舍',evidenceUtteranceIds:ids,positions:[{text:'先试点',evidenceUtteranceIds:[ids[0]]},{text:'先评估',evidenceUtteranceIds:[ids[1]]}]}]};
 }});f.service.start(f.id,f.input);await f.service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'failed',lastNotice:{code:'HOST_UNAVAILABLE'}});
});
it('当前公开内容实际改变申请者与下一发言者，而非固定角色顺序',async()=>{
 const observations:{version:number;requestedOrder:number;text:string}[]=[];const normal=new FakeDiscussionProvider();
 const f=await fixture(2,{
  assessIntent:async i=>{const last=i.utterances.at(-1)!;const text=last.sentences.join('');const requestedOrder=text.includes('需要补充成本证据')?2:1;observations.push({version:i.sourceTranscriptVersion,requestedOrder,text});return {wantsToSpeak:i.member.displayOrder===requestedOrder,intent:'answer',replyToUtteranceIds:[last.id],publicFocus:'回应当前证据缺口'};},
  generateUtterance:async(i,c)=>i.purpose!=='expert'?normal.generateUtterance(i,c):{sentences:[i.member.displayOrder===1?'需要补充成本证据。':'请进一步评估教学效果。'],replyToUtteranceIds:[i.utterances.at(-1)!.id]}
 });f.service.start(f.id,f.input);await f.service.idle();const s=f.drafts.get(f.id);
 expect(s.status).toBe('completed');expect(observations.some(o=>o.requestedOrder===2&&o.text==='需要补充成本证据。')).toBe(true);
 for(const u of s.utterances.slice(1)){const previous=s.utterances[u.seq-2]!;const chosen=s.roles.find(m=>m.memberId===u.roleId)!;expect(chosen.displayOrder).toBe(previous.sentences.join('').includes('需要补充成本证据')?2:1);expect(u.replyToUtteranceIds).toEqual([previous.id]);}
});
