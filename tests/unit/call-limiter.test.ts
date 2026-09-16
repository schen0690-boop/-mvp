import {expect,it,vi,afterEach} from 'vitest';
import {CallLimiter} from '../../src/providers/call-limiter.js';
afterEach(()=>vi.useRealTimers());
it('共享调用槽同场2全局4，释放后才派发排队任务',async()=>{
 const limiter=new CallLimiter(),signal=new AbortController().signal;const releases:(()=>void)[]=[];let active=0,max=0;
 const jobs=Array.from({length:8},(_,i)=>limiter.run(i<4?'a':'b',signal,Infinity,()=>new Promise<void>(resolve=>{active++;max=Math.max(max,active);releases.push(()=>{active--;resolve();});})));
 await Promise.resolve();expect(limiter.active).toBe(4);expect(limiter.pending).toBe(4);
 while(releases.length){releases.shift()!();await new Promise<void>(r=>queueMicrotask(r));await Promise.resolve();}
 await Promise.all(jobs);expect(max).toBe(4);expect(limiter.active).toBe(0);expect(limiter.pending).toBe(0);
});
it('排队取消或期限已过不调用operation，也不占用槽',async()=>{
 vi.useFakeTimers();const limiter=new CallLimiter(),controller=new AbortController(),releases:(()=>void)[]=[];
 const held=[1,2].map(()=>limiter.run('a',new AbortController().signal,Infinity,()=>new Promise<void>(resolve=>releases.push(resolve))));
 await Promise.resolve();let calls=0;const waiting=limiter.run('a',controller.signal,Infinity,async()=>{calls++;});const rejected=expect(waiting).rejects.toThrow('cancelled');controller.abort();await rejected;
 await expect(limiter.run('a',new AbortController().signal,performance.now()-1,async()=>{calls++;})).rejects.toThrow('timeout');
 expect(calls).toBe(0);releases.forEach(r=>r());await Promise.all(held);expect(limiter.pending).toBe(0);
});
it('正等待期限到期与有限队列不会产生调用或无限保留',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const limiter=new CallLimiter();const releases:(()=>void)[]=[];
 const held=[1,2].map(()=>limiter.run('a',new AbortController().signal,Infinity,()=>new Promise<void>(r=>releases.push(r))));
 let calls=0;const deadline=performance.now()+1000;const queued=Array.from({length:8},()=>limiter.run('a',new AbortController().signal,deadline,async()=>{calls++;}));const settled=Promise.allSettled(queued);
 await expect(limiter.run('a',new AbortController().signal,deadline,async()=>{calls++;})).rejects.toThrow('local_capacity');
 await vi.advanceTimersByTimeAsync(1000);expect((await settled).every(r=>r.status==='rejected')).toBe(true);expect(calls).toBe(0);expect(limiter.pending).toBe(0);
 releases.forEach(r=>r());await Promise.all(held);expect(vi.getTimerCount()).toBe(0);
});
