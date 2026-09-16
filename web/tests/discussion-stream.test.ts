import {afterEach,expect,it,vi} from 'vitest';
import {sample} from './lineup-fixtures.js';
import {DiscussionStream} from '../src/discussion-stream.js';
class Source extends EventTarget{closed=0;close(){this.closed++;}send(type:string,data:unknown){this.dispatchEvent(Object.assign(new Event(type),{data:typeof data==='string'?data:JSON.stringify(data),lastEventId:''}));}}
afterEach(()=>vi.useRealTimers());
it('原生错误不读HTTP状态，有限GET恢复；关闭后迟到GET不更新且定时器清理',async()=>{
 vi.useFakeTimers();const sources:Source[]=[];const factory=()=>{const s=new Source();sources.push(s);return s;};const snapshot=sample('lineup_confirmed'),adopt=vi.fn(),status=vi.fn();
 const get=vi.fn(async()=>snapshot);const stream=new DiscussionStream(snapshot,get,adopt,status,factory);
 sources[0]!.send('error',{});expect(sources[0]!.closed).toBe(1);expect(status).toHaveBeenLastCalledWith('recovering');expect(get).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1000);expect(get).toHaveBeenCalledTimes(1);expect(sources).toHaveLength(2);
 for(let n=0;n<5;n++){sources.at(-1)!.send('error',{});await vi.runAllTimersAsync();}expect(status).toHaveBeenLastCalledWith('manual');const count=get.mock.calls.length;await vi.runAllTimersAsync();expect(get).toHaveBeenCalledTimes(count);stream.close();expect(vi.getTimerCount()).toBe(0);
});
it('无效reset也是受控恢复，不向事件回调外抛出异常',()=>{
 vi.useFakeTimers();const source=new Source(),status=vi.fn();const s=sample('lineup_confirmed');let callback:EventListener|undefined;
 const stream=new DiscussionStream(s,async()=>s,()=>{},status,()=>({close:()=>source.close(),addEventListener(type,listener){if(type==='stream.reset')callback=listener as EventListener;}}));
 expect(()=>callback!(Object.assign(new Event('stream.reset'),{data:'{"private":"bad"}'}))).not.toThrow();expect(status).toHaveBeenLastCalledWith('recovering');stream.close();
});
it('Strict Mode建立清理再建立只有后一连接有效',()=>{
 const sources:Source[]=[];const s=sample('lineup_confirmed');const factory=()=>{const source=new Source();sources.push(source);return source;};const status=vi.fn();
 const first=new DiscussionStream(s,async()=>s,()=>{},status,factory);first.close();const second=new DiscussionStream(s,async()=>s,()=>{},status,factory);sources[0]!.send('open',{});expect(status).toHaveBeenLastCalledWith('connecting');sources[1]!.send('open',{});expect(status).toHaveBeenLastCalledWith('live');second.close();expect(sources.every(source=>source.closed===1)).toBe(true);
});
