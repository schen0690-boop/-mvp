import {afterEach,expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {discussionFixture} from '../helpers/discussion.js';
import {SqliteDiscussionStore} from '../../src/db/sqlite-discussion.js';
const connections:DatabaseSync[]=[];afterEach(()=>connections.splice(0).forEach(db=>db.close()));
async function fixture(n=4){const f=await discussionFixture(n);connections.push(f.db);return f;}
it('开始绑定确认版本，重复开始同一个运行；不改确认时间',async()=>{
 const f=await fixture();const result=f.store.begin(f.id,f.input);expect(result.snapshot.status).toBe('running');expect(result.snapshot.confirmedAt).toBe(f.confirmed.confirmedAt);
 expect(f.store.begin(f.id,f.input)).toMatchObject({runId:result.runId,replayed:true});expect(f.store.begin(f.id,{...f.input,requestId:randomUUID()}).runId).toBe(result.runId);
 expect(()=>f.store.begin(f.id,{...f.input,lineupRevision:2})).toThrow();
 const draft=f.drafts.create({topic:'未确认',requestId:randomUUID()});expect(()=>f.store.begin(draft.discussionId,f.input)).toThrow();
});
it('发言、小窗和多事件事务版本分离；事件失败全部回滚',async()=>{
 const f=await fixture();f.store.begin(f.id,f.input);const state=f.store.state(f.id)!;const moderator=state.snapshot.roles[0]!;
 f.store.role(state.key,moderator.memberId,'preparing');expect(f.store.append(state.key,moderator.memberId,{sentences:['欢迎讨论。'],replyToUtteranceIds:[]})).toBe(true);
 const after=f.store.state(f.id)!;expect(after.snapshot.transcriptVersion).toBe(1);expect(after.snapshot.lastEventId).toBeGreaterThan(after.snapshot.version);
 f.db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON public_events BEGIN SELECT RAISE(ABORT,'test-only failure'); END");
 expect(()=>f.store.append(after.key,moderator.memberId,{sentences:['后续发言。'],replyToUtteranceIds:[after.snapshot.utterances[0]!.id]})).toThrow();
 expect(f.store.state(f.id)!.snapshot).toEqual(after.snapshot);expect(f.db.prepare('SELECT COUNT(*) AS n FROM utterances').get()?.n).toBe(1);
});
it('普通预算最后额度原子争抢，总结最多两次且总数不超限',async()=>{
 const f=await fixture(1);f.store.begin(f.id,f.input);const key=f.store.state(f.id)!.key;
 f.db.prepare('UPDATE discussions SET calls_used=81 WHERE id=?').run(f.id);
 expect(await Promise.all([Promise.resolve().then(()=>f.store.reserve(key,false)),Promise.resolve().then(()=>f.store.reserve(key,false))])).toEqual([true,false]);
 f.store.stop(f.id,'call_budget_exhausted');const summaryKey=f.store.state(f.id)!.key;
 expect(f.store.reserve(key,false)).toBe(false);expect(f.store.reserve(summaryKey,true)).toBe(true);expect(f.store.reserve(summaryKey,true)).toBe(true);expect(f.store.reserve(summaryKey,true)).toBe(false);expect(f.store.state(f.id)!.callsUsed).toBe(84);
});
it('停止冻结内容、旧结果失效，总结幂等及终态不能重开',async()=>{
 const f=await fixture();f.store.begin(f.id,f.input);const old=f.store.state(f.id)!;
 f.store.append(old.key,old.snapshot.roles[0]!.memberId,{sentences:['开场。'],replyToUtteranceIds:[]});f.store.stop(f.id,'user_requested');const current=f.store.state(f.id)!;
 expect(f.store.append(old.key,old.snapshot.roles[0]!.memberId,{sentences:['迟到。'],replyToUtteranceIds:[]})).toBe(false);
 expect(f.store.finish(current.key,'已保留公开发言。')).toBe(true);expect(f.store.finish(current.key,'迟到总结。')).toBe(false);
 expect(f.store.stop(f.id,'duration_limit').status).toBe('completed');expect(f.store.begin(f.id,f.input).replayed).toBe(true);
 expect(()=>f.store.begin(f.id,{...f.input,requestId:randomUUID()})).toThrow();
});
it('重开只恢复中断运行且保留已提交发言，不自动调用Provider',async()=>{
 const f=await fixture();f.store.begin(f.id,f.input);const st=f.store.state(f.id)!;f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['保留记录。'],replyToUtteranceIds:[]});
 const other=f.drafts.create({topic:'草稿',requestId:randomUUID()});const db=new DatabaseSync(f.path);connections.push(db);const store=new SqliteDiscussionStore(db);store.recover();
 expect(store.state(f.id)!.snapshot).toMatchObject({status:'failed',transcriptVersion:1});expect(store.state(other.discussionId)!.snapshot.status).toBe('created');
});
it('增量观点证据落库，失败保留旧来源，旧版本不能覆盖',async()=>{
 const f=await fixture(2);f.store.begin(f.id,f.input);
 for(let i=0;i<3;i++){const st=f.store.state(f.id)!;f.store.append(st.key,st.snapshot.roles[i]!.memberId,{sentences:['先做验证。'],replyToUtteranceIds:i?[st.snapshot.utterances.at(-1)!.id]:[]});}
 const state=f.store.state(f.id)!;const ids=state.snapshot.utterances.slice(1).map(u=>u.id);
 const items=[{kind:'consensus' as const,text:'先验证',evidenceUtteranceIds:ids,positions:[]}];
 expect(f.store.synthesize(state.key,items)).toBe(true);const saved=f.store.state(f.id)!.snapshot.synthesis;
 f.store.append(state.key,state.snapshot.roles[1]!.memberId,{sentences:['再讨论成本。'],replyToUtteranceIds:[ids[1]!]});
 expect(f.store.synthesize(state.key,items)).toBe(false);f.store.synthesisStatus(f.store.state(f.id)!.key,'failed');expect(f.store.state(f.id)!.snapshot.synthesis).toEqual(saved);
 expect(f.db.prepare('SELECT COUNT(*) AS n FROM finding_evidence').get()?.n).toBe(2);
});
