import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {discussionFixture} from '../helpers/discussion.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
import {ProviderError} from '../../src/providers/roster.js';
import {CallLimiter} from '../../src/providers/call-limiter.js';
import type {DiscussionProvider} from '../../src/providers/discussion.js';
const cleanup:(()=>Promise<void>)[]=[];
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();vi.useRealTimers();});
async function fixture(n=4,hooks:Partial<DiscussionProvider>={}){
 const f=await discussionFixture(n),limiter=new CallLimiter(),service=new DiscussionService(f.store,new FakeDiscussionProvider(hooks),limiter);
 cleanup.push(async()=>{await service.close();f.db.close();});return {...f,service,limiter};
}
it('完整Fake轨迹：开场→12专家回应→中途观点→一次总结并保留确认时间',async()=>{
 const f=await fixture();const start=f.service.start(f.id,f.input);expect(start.snapshot.status).toBe('running');
 expect(f.service.start(f.id,{...f.input,requestId:randomUUID()}).runId).toBe(start.runId);await f.service.idle();
 const s=f.drafts.get(f.id);expect(s).toMatchObject({status:'completed',stopReason:'turn_limit',transcriptVersion:13,confirmedAt:f.confirmed.confirmedAt,summary:{status:'ready',sourceTranscriptVersion:13}});
 expect(s.synthesis?.items.length).toBeGreaterThan(0);expect(s.synthesis!.sourceTranscriptVersion).toBeLessThan(s.transcriptVersion);
 expect(s.summary!.text).toContain('13条');expect(f.store.state(f.id)!.expertTurns).toBe(12);expect(f.limiter.active).toBe(0);expect(f.limiter.pending).toBe(0);
 const events=f.db.prepare('SELECT type FROM public_events WHERE discussion_id=? ORDER BY event_id').all(f.id).map(e=>e.type);expect(events.indexOf('synthesis.updated')).toBeLessThan(events.indexOf('summary.ready'));
});
it('单专家不因公平规则卡死，不能制造两专家共识',async()=>{const f=await fixture(1);f.service.start(f.id,f.input);await f.service.idle();expect(f.store.state(f.id)!.expertTurns).toBe(12);expect(f.drafts.get(f.id).synthesis!.items).toEqual([]);});
it('无人申请只追问一次后有限收尾',async()=>{
 const f=await fixture(4,{assessIntent:async()=>({wantsToSpeak:false,intent:'question',replyToUtteranceIds:[],publicFocus:null})});f.service.start(f.id,f.input);await f.service.idle();
 expect(f.drafts.get(f.id)).toMatchObject({status:'completed',stopReason:'no_participation',transcriptVersion:2});
});
it('总结失败保存completed+unavailable，不伪造文本',async()=>{
 let attempts=0;const f=await fixture(1,{summarize:async()=>{attempts++;throw new ProviderError('transport');}});f.service.start(f.id,f.input);await f.service.idle();
 expect(attempts).toBe(2);expect(f.drafts.get(f.id)).toMatchObject({status:'completed',summary:{status:'unavailable',text:null},lastNotice:{code:'SUMMARY_UNAVAILABLE'}});
});
it('永久Provider配置错误直接failed且不继续重试',async()=>{
 let calls=0;const f=await fixture(1,{generateUtterance:async()=>{calls++;throw new ProviderError('configuration');}});f.service.start(f.id,f.input);await f.service.idle();expect(calls).toBe(1);expect(f.drafts.get(f.id).status).toBe('failed');
});
it('立即结束零发言不调总结，重复结束与终态开始安全',async()=>{
 let calls=0;const f=await fixture(1,{generateUtterance:async()=>{calls++;return {};},summarize:async()=>{calls++;return {};}});f.service.start(f.id,f.input);f.service.stop(f.id,{});f.service.stop(f.id,{});await f.service.idle();
 expect(calls).toBe(0);expect(f.drafts.get(f.id)).toMatchObject({status:'completed',summary:{status:'unavailable'},lastNotice:{code:'SUMMARY_NO_CONTENT'}});expect(f.service.start(f.id,f.input).replayed).toBe(true);
});
it('停止后迟到专家成功无效，独立总结不被普通取消误杀',async()=>{
 const entered=deferred<void>(),late=deferred<unknown>();const normal=new FakeDiscussionProvider();let summaries=0;
 const f=await fixture(1,{generateUtterance:async(i,c)=>{if(i.purpose==='expert'){entered.resolve();return late.promise;}return normal.generateUtterance(i,c);},summarize:async(i,c)=>{summaries++;expect(c.signal.aborted).toBe(false);return normal.summarize(i,c);}});
 f.service.start(f.id,f.input);await entered.promise;f.service.stop(f.id,{});await f.service.idle();const before=f.drafts.get(f.id);
 late.resolve({sentences:['迟到结果。'],replyToUtteranceIds:[before.utterances[0]!.id]});await Promise.resolve();expect(f.drafts.get(f.id)).toEqual(before);expect(summaries).toBe(1);expect(before.transcriptVersion).toBe(1);expect(f.limiter.active).toBe(0);
});
it('连续两个综合检查点失败有限收尾，保留已提交发言',async()=>{
 const f=await fixture(2,{extractSynthesis:async()=>({items:[{hidden_reasoning:'not public'}]})});f.service.start(f.id,f.input);await f.service.idle();
 expect(f.drafts.get(f.id)).toMatchObject({status:'completed',stopReason:'synthesis_unavailable',transcriptVersion:3});expect(JSON.stringify(f.drafts.get(f.id))).not.toContain('hidden_reasoning');
});
it('30秒调用超时、两次共享任务期限；总结60秒降级，迟到不覆盖',async()=>{
 const f=await fixture(1,{summarize:async()=>new Promise(()=>{})});vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});
 f.service.start(f.id,f.input);await vi.advanceTimersByTimeAsync(60000);await f.service.idle();
 expect(f.drafts.get(f.id)).toMatchObject({status:'completed',summary:{status:'unavailable'}});expect(f.store.state(f.id)!.summaryCallsUsed).toBe(2);expect(vi.getTimerCount()).toBe(0);
});
it('10分钟运行截止包含排队和调用，总结读取最终已提交内容',async()=>{
 const normal=new FakeDiscussionProvider();const f=await fixture(1,{assessIntent:async(i,c)=>{await new Promise(r=>setTimeout(r,29000));return normal.assessIntent(i,c);},generateUtterance:async(i,c)=>{await new Promise(r=>setTimeout(r,29000));return normal.generateUtterance(i,c);}});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});f.service.start(f.id,f.input);await vi.advanceTimersByTimeAsync(600000);await f.service.idle();
 const s=f.drafts.get(f.id);expect(s.stopReason).toBe('duration_limit');expect(s.summary?.sourceTranscriptVersion).toBe(s.transcriptVersion);expect(f.limiter.active).toBe(0);
});
it('普通预算耗尽有限收尾且发送次数不使用总结预留',async()=>{
 const gate=deferred<void>(),entered=deferred<void>();const normal=new FakeDiscussionProvider();
 const f=await fixture(1,{assessIntent:async(i,c)=>{entered.resolve();await gate.promise;return normal.assessIntent(i,c);}});f.service.start(f.id,f.input);await entered.promise;
 f.db.prepare('UPDATE discussions SET calls_used=82 WHERE id=?').run(f.id);gate.resolve();await f.service.idle();expect(f.drafts.get(f.id).stopReason).toBe('call_budget_exhausted');expect(f.store.state(f.id)!.callsUsed).toBe(83);
});
it('注册runner失败在持久化后明确failed，不留假运行',async()=>{
 const f=await fixture();const service=new DiscussionService(f.store,new FakeDiscussionProvider(),f.limiter,{schedule:()=>{throw new Error('injected');}});
 service.start(f.id,f.input);await service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'failed',lastNotice:{code:'RUN_START_FAILED'}});await service.close();
});
