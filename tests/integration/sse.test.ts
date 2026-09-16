import {afterEach,expect,it} from 'vitest';
import {createServer,type Server} from 'node:http';
import {once} from 'node:events';
import {discussionFixture} from '../helpers/discussion.js';
import {createApp} from '../../src/http/app.js';
import {SqliteEventSource} from '../../src/db/public-events.js';
import {subscriberCount} from '../../src/db/commit-notifications.js';
import {randomUUID} from 'node:crypto';
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close();});
async function fixture(){
 const f=await discussionFixture(2);const server=createServer(createApp(f.drafts,undefined,undefined,undefined,new SqliteEventSource(f.db)));
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('TEST_ADDRESS');
 const abort=new AbortController();cleanups.push(async()=>{abort.abort();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));f.db.close();});
 return {...f,server,abort,url:`http://127.0.0.1:${address.port}/api/discussions/${f.id}/events`};
}
it('已确认讨论支持真实HTTP事件流，观察不启动运行',async()=>{
 const f=await fixture();const r=await fetch(f.url+'?after='+f.confirmed.lastEventId,{signal:f.abort.signal});
 expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('text/event-stream');expect(f.store.state(f.id)!.snapshot.status).toBe('lineup_confirmed');
});
function stream(r:Response){
 const reader=r.body!.getReader(),decoder=new TextDecoder();let buffer='';
 return {async next(){for(;;){const at=buffer.indexOf('\n\n');if(at>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);if(frame.startsWith(':'))continue;const lines=frame.split('\n');return {type:lines.find(l=>l.startsWith('event: '))?.slice(7),id:lines.find(l=>l.startsWith('id: '))?.slice(4),data:JSON.parse(lines.find(l=>l.startsWith('data: '))!.slice(6))};}
 const chunk=await reader.read();if(chunk.done)throw Error('STREAM_ENDED');buffer+=decoder.decode(chunk.value,{stream:true});}},cancel:()=>reader.cancel()};
}
it('快照后的间隙、补发与实时提交均按顺序到达，同批版本保留',async()=>{
 const f=await fixture();const cursor=f.confirmed.lastEventId;f.store.begin(f.id,f.input);
 const r=await fetch(f.url+'?after='+cursor,{signal:AbortSignal.any([f.abort.signal,AbortSignal.timeout(5000)])});const s=stream(r);
 const start=await s.next();expect(start.data.eventId).toBe(cursor+1);expect(start.data.payload.status).toBe('running');
 const st=f.store.state(f.id)!;f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['通过真实HTTP推送。'],replyToUtteranceIds:[]});
 const a=await s.next(),b=await s.next();expect(a.type).toBe('utterance.created');expect(b.type).toBe('role.status_changed');expect(a.data.dataVersion).toBe(b.data.dataVersion);expect(a.data.transactionLastEventId).toBe(b.data.eventId);expect(a.id).toBe(f.id+':'+a.data.eventId);await s.cancel();
});
it('Last-Event-ID优先；跨场/非法header拒绝，未来/半批/缺失游标安全reset',async()=>{
 const f=await fixture();f.store.begin(f.id,f.input);const st=f.store.state(f.id)!;f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['开场。'],replyToUtteranceIds:[]});const end=f.store.state(f.id)!.snapshot.lastEventId;
 for(const [after,reason] of [[end+1,'cursor_ahead'],[end-1,'partial_transaction']] as const){const s=stream(await fetch(f.url+'?after='+after,{signal:f.abort.signal}));expect((await s.next()).data.reason).toBe(reason);await s.cancel();}
 const s=stream(await fetch(f.url+'?after=0',{headers:{'Last-Event-ID':f.id+':'+(end-2)},signal:f.abort.signal}));expect((await s.next()).data.eventId).toBe(end-1);await s.cancel();
 for(const h of [randomUUID()+':0',f.id+':bad'])expect((await fetch(f.url,{headers:{'Last-Event-ID':h}})).status).toBe(400);
 f.db.prepare('DELETE FROM public_events WHERE discussion_id=? AND event_id=?').run(f.id,end-1);
 const broken=stream(await fetch(f.url+'?after='+(end-2),{signal:f.abort.signal}));expect((await broken.next()).data.reason).toBe('history_unavailable');await broken.cancel();
});
it('终态前断线可完整补齐总结同批，再次追平204；重复补发稳定',async()=>{
 const f=await fixture();f.store.begin(f.id,f.input);let st=f.store.state(f.id)!;f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['保留内容。'],replyToUtteranceIds:[]});
 const cursor=f.store.state(f.id)!.snapshot.lastEventId;f.store.stop(f.id,'user_requested');st=f.store.state(f.id)!;f.store.finish(st.key,'讨论已结束。');
 for(let repeat=0;repeat<2;repeat++){const s=stream(await fetch(f.url+'?after='+cursor,{signal:f.abort.signal}));const types=[];for(;;){const e=await s.next();types.push(e.type);if(e.type==='stream.end')break;}expect(types).toEqual(['discussion.status_changed','summary.ready','discussion.status_changed','stream.end']);await s.cancel();}
 expect((await fetch(f.url+'?after='+f.store.state(f.id)!.snapshot.lastEventId)).status).toBe(204);
});
it('两个观察者收到同一已提交事件，失败事务不推送，断开不改业务且释放订阅',async()=>{
 const f=await fixture();const a=stream(await fetch(f.url+'?after='+f.confirmed.lastEventId,{signal:f.abort.signal}));const b=stream(await fetch(f.url+'?after='+f.confirmed.lastEventId,{signal:f.abort.signal}));expect(subscriberCount(f.db)).toBe(2);
 f.store.begin(f.id,f.input);expect((await a.next()).data).toEqual((await b.next()).data);
 const st=f.store.state(f.id)!;f.db.exec("CREATE TRIGGER fail_push BEFORE INSERT ON public_events BEGIN SELECT RAISE(ABORT,'private diagnostic'); END");
 expect(()=>f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['不可发布。'],replyToUtteranceIds:[]})).toThrow();f.db.exec('DROP TRIGGER fail_push');
 f.store.append(st.key,st.snapshot.roles[0]!.memberId,{sentences:['正式提交。'],replyToUtteranceIds:[]});expect((await a.next()).data.payload.utterance.sentences).toEqual(['正式提交。']);expect((await b.next()).data.payload.utterance.sentences).toEqual(['正式提交。']);
 await a.cancel();await b.cancel();await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));
 expect(f.store.state(f.id)!.snapshot.status).toBe('running');
});
it('其他讨论的事务不会在当前流中串场，未知讨论404',async()=>{
 const f=await fixture();const s=stream(await fetch(f.url+'?after='+f.confirmed.lastEventId,{signal:AbortSignal.any([f.abort.signal,AbortSignal.timeout(5000)])}));
 const other=f.drafts.create({topic:'另一场',requestId:randomUUID()});f.store.begin(f.id,f.input);const event=await s.next();expect(event.data.discussionId).toBe(f.id);expect(event.data.discussionId).not.toBe(other.discussionId);await s.cancel();
 expect((await fetch(f.url.replace(f.id,randomUUID()))).status).toBe(404);
});
it('非法游标及未知参数返回400而不是打开流',async()=>{
 const f=await fixture();for(const query of ['?after=-1','?after=1.2','?after=1&after=2','?unknown=1'])expect((await fetch(f.url+query)).status).toBe(400);
});
