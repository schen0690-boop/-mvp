import {afterEach,expect,it} from 'vitest';
import {startDiscussionStub,envelope} from '../../scripts/lib/discussion-stub.mjs';
import {DeepSeekDiscussionProvider,type DiscussionMetric} from '../../src/providers/deepseek-discussion.js';
import {adapterConfig} from '../helpers/discussion-adapter.js';
import {discussionFixture} from '../helpers/discussion.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
import {CallLimiter} from '../../src/providers/call-limiter.js';
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const c of cleanup.splice(0).reverse())await c();});
function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
async function fixture(hook?:Parameters<typeof startDiscussionStub>[0]){
 const stub=await startDiscussionStub(hook);cleanup.push(stub.close);const f=await discussionFixture(2),metrics:DiscussionMetric[]=[],limiter=new CallLimiter(),service=new DiscussionService(f.store,new DeepSeekDiscussionProvider(adapterConfig,stub.transport,m=>metrics.push(m)),limiter);
 cleanup.push(async()=>{await service.close();f.db.close();});return {...f,stub,service,metrics,limiter};
}
it('正式runner+真实适配器+本地HTTP+SQLite：中途提炼、12专家、总结含末条且覆盖旧观点',async()=>{
 const f=await fixture();f.service.start(f.id,f.input);await f.service.idle();const s=f.drafts.get(f.id);
 expect(s).toMatchObject({status:'completed',transcriptVersion:13,summary:{status:'ready',sourceTranscriptVersion:13}});expect(s.synthesis!.sourceTranscriptVersion).toBe(12);
 const summary=f.stub.requests.find(r=>r.task.operation==='summarize')!.task.input;expect(summary.utterances.at(-1)!.id).toBe(s.utterances.at(-1)!.id);expect(summary.synthesis!.sourceTranscriptVersion).toBe(12);
 expect(f.stub.requests.filter(r=>r.task.operation==='extractSynthesis')).toHaveLength(11);expect(f.stub.requests).toHaveLength(49);expect(f.store.state(f.id)!.callsUsed).toBe(49);expect(f.metrics).toHaveLength(49);expect(f.stub.maxActive).toBeLessThanOrEqual(2);expect(f.limiter.active).toBe(0);
 const events=f.db.prepare('SELECT type FROM public_events WHERE discussion_id=? ORDER BY event_id').all(f.id).map(r=>r.type);expect(events.indexOf('synthesis.updated')).toBeLessThan(events.indexOf('summary.ready'));expect(JSON.stringify(s)).not.toContain('STUB_PRIVATE');
});
for(const failures of [[503,'invalid'],['invalid',503]] as const)it(`唯一重试层共享预算 ${failures.join('→')}，无第三次开场`,async()=>{
 const f=await fixture((_t,r,n)=>{if(n>2)throw Error('UNEXPECTED_THIRD_ATTEMPT');const failure=failures[n-1];if(failure===503){r.statusCode=503;r.end('PRIVATE');}else r.end(JSON.stringify(envelope({sentences:[]})));return true;});f.service.start(f.id,f.input);await f.service.idle();
 expect(f.drafts.get(f.id).status).toBe('failed');expect(f.stub.requests).toHaveLength(2);expect(f.store.state(f.id)!.callsUsed).toBe(2);expect(f.metrics.map(m=>m.attempt)).toEqual([1,2]);expect(new Set(f.metrics.map(m=>m.taskId)).size).toBe(1);
});
it('鉴权确定性错误只一次，deepseek失败不回退Fake',async()=>{
 const f=await fixture((_t,r)=>{r.statusCode=401;r.end('PRIVATE');return true;});f.service.start(f.id,f.input);await f.service.idle();expect(f.stub.requests).toHaveLength(1);expect(f.drafts.get(f.id)).toMatchObject({status:'failed',utterances:[],lastNotice:{code:'DISCUSSION_PROVIDER_CONFIGURATION'}});
});
it('无效输出修复仍为原task的第二次，修复消息不带原始错误',async()=>{
 const f=await fixture((_t,r,n)=>{if(n!==1)return false;r.end(JSON.stringify(envelope({private:'INVALID_RAW'})));return true;});f.service.start(f.id,f.input);await f.service.idle();expect(f.drafts.get(f.id).status).toBe('completed');expect(f.metrics.slice(0,2).map(m=>m.attempt)).toEqual([1,2]);expect(f.metrics[0]!.taskId).toBe(f.metrics[1]!.taskId);const retry=f.stub.requests[1]!.body.messages[1]!.content;expect(retry).toContain('repairIssues');expect(retry).not.toContain('INVALID_RAW');expect(f.stub.requests).toHaveLength(50);
});
it('关闭期间迟到总结不能覆盖中断终态',async()=>{
 const entered=gate();let late:import('node:http').ServerResponse|undefined;const f=await fixture((t,r)=>{if(t.operation!=='summarize')return false;late=r;r.writeHead(200);r.write(' ');entered.resolve();return true;});f.service.start(f.id,f.input);await entered.promise;await f.service.close();const before=f.drafts.get(f.id);expect(before.status).toBe('failed');late!.end(JSON.stringify(envelope({text:'迟到总结。'})));await new Promise<void>(r=>setImmediate(r));expect(f.drafts.get(f.id)).toEqual(before);
});
it('停止取消HTTP正文，独立总结正常完成；迟到正文不能回写',async()=>{
 const entered=gate();let late:import('node:http').ServerResponse|undefined;
 const f=await fixture((t,r)=>{if(t.operation==='generateUtterance'&&t.input.purpose==='expert'){late=r;r.writeHead(200);r.write(' ');entered.resolve();return true;}return false;});
 f.service.start(f.id,f.input);await entered.promise;f.service.stop(f.id,{});await f.service.idle();const before=f.drafts.get(f.id);expect(before).toMatchObject({status:'completed',transcriptVersion:1,summary:{status:'ready'}});late!.end(JSON.stringify(envelope({sentences:['迟到发言。'],replyToUtteranceIds:[before.utterances[0]!.id]})));await new Promise<void>(r=>setImmediate(r));expect(f.drafts.get(f.id)).toEqual(before);expect(f.stub.requests.filter(r=>r.task.operation==='summarize')).toHaveLength(1);
});
it('总结两次503降级unavailable而非伪造正常文本',async()=>{
 const f=await fixture((t,r)=>{if(t.operation!=='summarize')return false;r.statusCode=503;r.end('PRIVATE');return true;});f.service.start(f.id,f.input);await f.service.idle();expect(f.stub.requests.filter(r=>r.task.operation==='summarize')).toHaveLength(2);expect(f.drafts.get(f.id)).toMatchObject({status:'completed',summary:{status:'unavailable',text:null}});
});
it('普通任务不占总结预留，保守计数与实际HTTP分开',async()=>{
 const entered=gate(),release=gate();const f=await fixture(async(t)=>{if(t.operation==='assessIntent'){entered.resolve();await release.promise;}return false;});f.service.start(f.id,f.input);await entered.promise;
 // Test-only exhaustion of an existing run, never touches a live authorization.
 f.db.prepare('UPDATE discussions SET calls_used=110 WHERE id=?').run(f.id);release.resolve();await f.service.idle();expect(f.drafts.get(f.id).stopReason).toBe('call_budget_exhausted');expect(f.store.state(f.id)!.callsUsed).toBe(111);expect(f.store.state(f.id)!.summaryCallsUsed).toBe(1);expect(f.stub.requests.filter(r=>r.task.operation==='generateUtterance')).toHaveLength(1);
});
it('两场并发使用共享限流且响应/指标按task归属隔离',async()=>{
 const stub=await startDiscussionStub();cleanup.push(stub.close);const a=await discussionFixture(2),b=await discussionFixture(2),limiter=new CallLimiter(),ma:DiscussionMetric[]=[],mb:DiscussionMetric[]=[];
 const sa=new DiscussionService(a.store,new DeepSeekDiscussionProvider(adapterConfig,stub.transport,m=>ma.push(m)),limiter),sb=new DiscussionService(b.store,new DeepSeekDiscussionProvider(adapterConfig,stub.transport,m=>mb.push(m)),limiter);
 cleanup.push(async()=>{await sa.close();await sb.close();a.db.close();b.db.close();});sa.start(a.id,a.input);sb.start(b.id,b.input);await Promise.all([sa.idle(),sb.idle()]);
 for(const f of [a,b]){const s=f.drafts.get(f.id);expect(s.status).toBe('completed');expect(s.utterances.every(u=>u.discussionId===f.id)).toBe(true);}expect(stub.requests).toHaveLength(98);expect(stub.maxActive).toBeLessThanOrEqual(4);expect(ma).toHaveLength(49);expect(mb).toHaveLength(49);expect(ma.some(x=>mb.some(y=>x.taskId===y.taskId))).toBe(false);expect(limiter.active).toBe(0);
});

it('普通配置工厂真实模式经本地HTTP接入正式runner，不依赖历史授权或验收ID',async()=>{
 const {selectProviders}=await import('../../src/app-providers.js');const stub=await startDiscussionStub();cleanup.push(stub.close);const providers=selectProviders({ROSTER_PROVIDER:'fake',DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:adapterConfig.apiKey},true,stub.transport);
 const f=await discussionFixture(2),service=new DiscussionService(f.store,providers.discussion,new CallLimiter());cleanup.push(async()=>{await service.close();f.db.close();});service.start(f.id,f.input);await service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'completed',summary:{status:'ready'}});expect(stub.requests).toHaveLength(49);expect(providers.publicConfig).toEqual({rosterProvider:'fake',discussionProvider:'deepseek'});
});
