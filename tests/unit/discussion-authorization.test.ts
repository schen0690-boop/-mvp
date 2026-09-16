import {expect,it} from 'vitest';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {DiscussionAuthorization} from '../../src/live/discussion-authorization.js';
const root=resolve('.tmp/stage-6b/unit');mkdirSync(root,{recursive:true});
function fixture(){const dir=mkdtempSync(root+'/auth-'),binding={authorizationId:crypto.randomUUID(),discussionId:crypto.randomUUID(),runId:crypto.randomUUID(),generationId:crypto.randomUUID(),lineupRevision:1};const auth=new DiscussionAuthorization(dir,binding);auth.claim();return {dir,binding,auth};}
function ctx(runId:string,taskId=crypto.randomUUID(),attemptNo=1){return {signal:new AbortController().signal,deadline:performance.now()+30000,runId,epoch:1,taskId,attemptNo,sourceTranscriptVersion:1};}
it('独立普通18+总结2，所有预约重开后保留且不能再次claim',()=>{
 const {auth,binding,dir}=fixture();for(let i=0;i<18;i++)auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId));expect(()=>auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId))).toThrow();const task=crypto.randomUUID();auth.reserve('summarize',binding.discussionId,ctx(binding.runId,task));auth.reserve('summarize',binding.discussionId,ctx(binding.runId,task,2));expect(auth.counts).toEqual({ordinary:18,summary:2,total:20});expect(()=>auth.reserve('summarize',binding.discussionId,ctx(binding.runId))).toThrow();const reopened=new DiscussionAuthorization(dir,binding);expect(reopened.counts.total).toBe(20);expect(()=>reopened.claim()).toThrow();
});
it('错误discussion/run、重复attempt、第三attempt、第二总结task、关闭后都拒绝',()=>{
 const {auth,binding}=fixture();expect(()=>auth.reserve('assessIntent',crypto.randomUUID(),ctx(binding.runId))).toThrow();expect(()=>auth.reserve('assessIntent',binding.discussionId,ctx(crypto.randomUUID()))).toThrow();const task=crypto.randomUUID();auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId,task));expect(()=>auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId,task))).toThrow();expect(()=>auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId,task,3))).toThrow();auth.reserve('summarize',binding.discussionId,ctx(binding.runId));expect(()=>auth.reserve('summarize',binding.discussionId,ctx(binding.runId))).toThrow();auth.close('terminal');expect(auth.closed).toBe(true);expect(()=>auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId))).toThrow();
});
it('两个并行任务争最后普通额度只一项成功；超时/取消不退还已预约',async()=>{
 const {auth,binding}=fixture();for(let i=0;i<17;i++)auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId));const results=await Promise.allSettled([1,2].map(()=>Promise.resolve().then(()=>auth.reserve('assessIntent',binding.discussionId,ctx(binding.runId)))));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(auth.counts.ordinary).toBe(18);const controller=new AbortController();controller.abort();expect(()=>auth.reserve('summarize',binding.discussionId,{...ctx(binding.runId),signal:controller.signal})).toThrow();expect(auth.counts.ordinary).toBe(18);
});
it('已开始但零发送也不能重启claim；换绑定和关闭后重开仍拒绝',()=>{
 const {auth,binding,dir}=fixture();expect(auth.counts.total).toBe(0);expect(()=>new DiscussionAuthorization(dir,binding).claim()).toThrow();expect(()=>new DiscussionAuthorization(dir,{...binding,runId:crypto.randomUUID()})).toThrow();auth.close('interrupted');const reopened=new DiscussionAuthorization(dir,binding);expect(reopened.closed).toBe(true);expect(()=>reopened.reserve('assessIntent',binding.discussionId,ctx(binding.runId))).toThrow();
});
