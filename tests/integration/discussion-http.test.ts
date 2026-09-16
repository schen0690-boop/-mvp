import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {discussionFixture} from '../helpers/discussion.js';
import {createApp} from '../../src/http/app.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
import {isObject} from '../../src/domain/input.js';
import {decodeSnapshot} from '../../web/src/api.js';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();vi.restoreAllMocks();});
async function fixture(){
 const f=await discussionFixture(1),service=new DiscussionService(f.store,new FakeDiscussionProvider());
 const server=createApp(f.drafts,()=>{},f.lineup,service).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('TCP_REQUIRED');const base='http://127.0.0.1:'+address.port+'/api/discussions';
 cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await service.close();f.db.close();});
 const post=(suffix:string,body:unknown)=>fetch(base+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {...f,service,post,base};
}
async function json(response:Response){const value:unknown=await response.json();if(!isObject(value))throw new Error('JSON');return value;}
it('真实Express开始202、幂等200、终态24字段、只读GET与列表',async()=>{
 const f=await fixture();const response=await f.post('/'+f.id+'/start',f.input);expect(response.status).toBe(202);expect(await json(response)).toMatchObject({discussionId:f.id,replayed:false,snapshot:{status:'running'}});
 await f.service.idle();const before=f.store.state(f.id)!.callsUsed;const snapshot=await json(await fetch(f.base+'/'+f.id));expect(Object.keys(snapshot)).toHaveLength(24);expect(snapshot.status).toBe('completed');expect(decodeSnapshot(snapshot)).toEqual(snapshot);
 expect((await f.post('/'+f.id+'/start',f.input)).status).toBe(200);expect((await f.post('/'+f.id+'/stop',{})).status).toBe(200);
 expect(await json(await fetch(f.base+'?status=all'))).toMatchObject({items:[{status:'completed'}]});expect(f.store.state(f.id)!.callsUsed).toBe(before);
 expect((await fetch(f.base+'/'+f.id+'/events')).status).toBe(404);
});
it('输入400、缺失404、未确认/旧版本409，不泄露内部信息',async()=>{
 const f=await fixture(),draft=f.drafts.create({topic:'未确认',requestId:randomUUID()});
 for(const [path,body,code] of [[f.id+'/start',{},400],[randomUUID()+'/start',f.input,404],[draft.discussionId+'/start',f.input,409],[f.id+'/start',{...f.input,lineupRevision:2},409],[f.id+'/stop',{},409],[f.id+'/stop',{runId:'client'},400]] as const){
  const response=await f.post('/'+path,body);expect(response.status).toBe(code);const value=await json(response);expect(value).toMatchObject({error:{retryable:false,action:'none'}});expect(JSON.stringify(value)).not.toMatch(/SELECT|sqlite|stack|Authorization|reasoning/i);
 }
 const bad=await fetch(f.base+'/'+f.id+'/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});expect(bad.status).toBe(400);
});
it('持久化不可用503；未知HTTP异常500，与公开诊断分开',async()=>{
 const f=await fixture();vi.spyOn(f.store,'begin').mockImplementation(()=>{throw new Error('SELECT private/path.sql stack');});const response=await f.post('/'+f.id+'/start',f.input);expect(response.status).toBe(503);expect(JSON.stringify(await json(response))).not.toContain('private');
 vi.spyOn(f.service,'start').mockImplementation(()=>{throw new Error('upstream private');});const unknown=await f.post('/'+f.id+'/start',f.input);expect(unknown.status).toBe(500);expect(JSON.stringify(await json(unknown))).not.toContain('private');
});
it('整条Fake HTTP执行拦截所有非loopback出站，外部请求为零',async()=>{
 const f=await fixture(),original=globalThis.fetch;let external=0;vi.spyOn(globalThis,'fetch').mockImplementation((input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.hostname!=='127.0.0.1'){external++;throw new Error('EXTERNAL_NETWORK_FORBIDDEN');}return original(input,init);});
 expect((await f.post('/'+f.id+'/start',f.input)).status).toBe(202);await f.service.idle();expect((await fetch(f.base+'/'+f.id)).status).toBe(200);expect(external).toBe(0);
});
