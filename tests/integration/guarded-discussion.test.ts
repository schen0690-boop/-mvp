import {afterEach,expect,it,vi} from 'vitest';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {discussionFixture} from '../helpers/discussion.js';
import {adapterConfig} from '../helpers/discussion-adapter.js';
import {startDiscussionStub,envelope} from '../../scripts/lib/discussion-stub.mjs';
import {DiscussionAuthorization} from '../../src/live/discussion-authorization.js';
import {GuardedDiscussionProvider} from '../../src/live/guarded-discussion.js';
import {SqliteDiscussionStore} from '../../src/db/sqlite-discussion.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const c of cleanup.splice(0).reverse())await c();vi.useRealTimers();});
async function fixture(hook?:Parameters<typeof startDiscussionStub>[0]){
 const f=await discussionFixture(2),stub=await startDiscussionStub(hook);mkdirSync('.tmp/stage-6b/guard',{recursive:true});const auth=new DiscussionAuthorization(mkdtempSync('.tmp/stage-6b/guard/auth-'),{authorizationId:crypto.randomUUID(),discussionId:f.id,runId:crypto.randomUUID(),generationId:f.input.generationId,lineupRevision:1});
 const store=new SqliteDiscussionStore(f.db,{discussionId:f.id,runId:auth.binding.runId,expertTurns:2,runDurationMs:120000,beforeStart:()=>auth.claim()});const service=new DiscussionService(store,new GuardedDiscussionProvider(auth,adapterConfig,stub.transport,()=>store.state(f.id)));
 cleanup.push(async()=>{await service.close();await stub.close();f.db.close();});return {...f,stub,auth,store,service};
}
it('受保护正式短run真实HTTP路径9次，首次成功不重试，重开保留计数',async()=>{
 const f=await fixture();f.service.start(f.id,f.input);await f.service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'completed',transcriptVersion:3,synthesis:{sourceTranscriptVersion:2},summary:{status:'ready'}});expect(f.stub.requests).toHaveLength(9);expect(f.auth.counts).toEqual({ordinary:8,summary:1,total:9});
 expect(new DiscussionAuthorization(f.auth.directory,f.auth.binding).counts.total).toBe(9);
});
it('HTTP503与JSON修复共享两次真实传输预约；不出现第三次开场',async()=>{
 const f=await fixture((_t,r,n)=>{if(n===1){r.statusCode=503;r.end('PRIVATE');}else r.end(JSON.stringify(envelope({sentences:[]})));return true;});f.service.start(f.id,f.input);await f.service.idle();expect(f.drafts.get(f.id).status).toBe('failed');expect(f.stub.requests).toHaveLength(2);expect(f.auth.counts.total).toBe(2);
});
it('401永久错误一次发送，保守占用不会退还',async()=>{
 const f=await fixture((_t,r)=>{r.statusCode=401;r.end('PRIVATE');return true;});f.service.start(f.id,f.input);await f.service.idle();expect(f.drafts.get(f.id).status).toBe('failed');expect(f.stub.requests).toHaveLength(1);expect(f.auth.counts.total).toBe(1);
});
it('普通额度不足进入收尾，两个总结预留不被普通请求消费',async()=>{
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);const f=await fixture(async t=>{if(t.operation==='assessIntent'){entered();await gate;}return false;});f.service.start(f.id,f.input);await ready;
 while(f.auth.counts.ordinary<18)f.auth.reserve('assessIntent',f.id,{signal:new AbortController().signal,deadline:performance.now()+30000,runId:f.auth.binding.runId,taskId:crypto.randomUUID(),attemptNo:1,epoch:1,sourceTranscriptVersion:1});
 release();await f.service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'completed',stopReason:'call_budget_exhausted',summary:{status:'ready'}});expect(f.auth.counts).toEqual({ordinary:18,summary:1,total:19});expect(f.stub.requests.filter(r=>r.task.operation==='generateUtterance')).toHaveLength(1);
});
it('普通HTTP取消保留预约且独立总结仍可发送',async()=>{
 let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);const f=await fixture((t,r)=>{if(t.operation==='generateUtterance'&&t.input.purpose==='expert'){r.writeHead(200);r.write(' ');entered();return true;}return false;});f.service.start(f.id,f.input);await ready;f.service.stop(f.id,{});await f.service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'completed',transcriptVersion:1,summary:{status:'ready'}});expect(f.auth.counts).toEqual({ordinary:4,summary:1,total:5});
});
