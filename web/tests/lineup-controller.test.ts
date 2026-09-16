import { afterEach, expect, it, vi } from 'vitest';
import { Controller } from '../src/controller.js';
import { ApiError, type Api, type DraftSnapshot, type GenerateResult } from '../src/api.js';
import { snapshot } from './fixtures.js';
import { sample } from './lineup-fixtures.js';
const generating=sample('generating_lineup'), ready=sample('awaiting_confirmation'), failed=sample('lineup_generation_failed'), confirmed=sample('lineup_confirmed');
const id=ready.discussionId;
const draft={...snapshot,discussionId:id};
function result(s:DraftSnapshot):GenerateResult {return {discussionId:id,generationId:s.lineupGeneration!.generationId,generationVersion:1,snapshot:s,replayed:false};}
function setup(initial:DraftSnapshot=draft,changes:Partial<Api>={}) {
  const api:Api={start:vi.fn(),stop:vi.fn(),create:vi.fn(),list:vi.fn(async()=>[]),get:vi.fn(async()=>initial),generate:vi.fn(async()=>result(generating)),confirm:vi.fn(async()=>({discussionId:id,snapshot:confirmed,replayed:false})),...changes};
  const c=new Controller(api);controllers.push(c);return {api,c};
}
const controllers:Controller[]=[];
afterEach(()=>{controllers.splice(0).forEach(c=>c.dispose());vi.useRealTimers();});
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
it('created generate uses null base, synchronous busy guard, server generating snapshot',async()=>{
  const wait=deferred<GenerateResult>();const {api,c}=setup(draft,{generate:vi.fn(()=>wait.promise)});await c.select(id);
  const first=c.generate();await c.generate();expect(api.generate).toHaveBeenCalledTimes(1);expect(c.getState().actionBusy).toBe(true);
  expect(api.generate).toHaveBeenCalledWith(id,{requestId:expect.any(String),expectedGenerationId:null});
  wait.resolve(result(generating));await first;expect(c.getState().detail).toEqual(generating);expect(c.getState().actionBusy).toBe(false);
});
it.each([failed,ready])('retry/regenerate uses current base and accepted result hides old roles ($status)',async initial=>{
  const accepted={...generating,version:initial.version+1,lastEventId:initial.version+1};
  const {api,c}=setup(initial,{generate:vi.fn(async()=>result(accepted))});await c.select(id);await c.generate();expect(api.generate).toHaveBeenCalledWith(id,{requestId:expect.any(String),expectedGenerationId:initial.lineupGeneration!.generationId});expect(c.getState().detail?.roles).toEqual([]);
});
it.each([generating,confirmed])('forbids generation in $status',async initial=>{const {api,c}=setup(initial);await c.select(id);await c.generate();expect(api.generate).not.toHaveBeenCalled();});
it('confirm sends exact versions once, applies confirmed without start',async()=>{
  const wait=deferred<{discussionId:string;snapshot:DraftSnapshot;replayed:boolean}>();const {api,c}=setup(ready,{confirm:vi.fn(()=>wait.promise)});await c.select(id);
  const first=c.confirm();await c.confirm();expect(api.confirm).toHaveBeenCalledTimes(1);expect(api.confirm).toHaveBeenCalledWith(id,{generationId:ready.lineupGeneration!.generationId,lineupRevision:1});
  wait.resolve({discussionId:id,snapshot:confirmed,replayed:false});await first;expect(c.getState().detail?.status).toBe('lineup_confirmed');
});
it.each([draft,generating,failed,confirmed])('only ready is confirmable: $status',async initial=>{const {api,c}=setup(initial);await c.select(id);await c.confirm();expect(api.confirm).not.toHaveBeenCalled();});
it.each([500,503,0])('confirm error %i retains lineup and permits deliberate retry',async status=>{
  const {api,c}=setup(ready,{confirm:vi.fn().mockRejectedValueOnce(new ApiError('private',status)).mockResolvedValue({discussionId:id,snapshot:confirmed,replayed:false})});await c.select(id);await c.confirm();
  expect(c.getState()).toMatchObject({detail:ready,actionBusy:false,actionError:'确认失败，请重试。'});await c.confirm();expect(api.confirm).toHaveBeenCalledTimes(2);expect(c.getState().detail).toEqual(confirmed);
});
it.each([ready,confirmed])('409 reloads current snapshot and never auto-confirms $status',async latest=>{
  const {api,c}=setup(ready,{confirm:vi.fn(async()=>{throw new ApiError('private',409);})});await c.select(id);vi.mocked(api.get).mockResolvedValue(latest);await c.confirm();
  expect(api.get).toHaveBeenCalledTimes(2);expect(api.confirm).toHaveBeenCalledTimes(1);expect(c.getState()).toMatchObject({detail:latest,actionError:'阵容已发生变化，请确认最新版本。'});
});
it('late generate response from A cannot overwrite B',async()=>{
  const wait=deferred<GenerateResult>();const {c}=setup(draft,{generate:()=>wait.promise,get:async key=>({...draft,discussionId:key})});await c.select(id);const a=c.generate();await c.select(snapshot.discussionId);wait.resolve(result(generating));await a;expect(c.getState()).toMatchObject({selectedId:snapshot.discussionId,detail:{status:'created'},actionBusy:false});
});
it('unknown generation result retry preserves request identity',async()=>{
  const {api,c}=setup(draft,{generate:vi.fn(async()=>{throw new ApiError('offline',0);})});await c.select(id);await c.generate();await c.generate();expect(vi.mocked(api.generate).mock.calls[0]).toEqual(vi.mocked(api.generate).mock.calls[1]);
});
it('generating refresh starts serial two-second polling and stops at terminal',async()=>{
  vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);await vi.advanceTimersByTimeAsync(1999);expect(api.get).toHaveBeenCalledTimes(1);
  vi.mocked(api.get).mockResolvedValue(ready);await vi.advanceTimersByTimeAsync(1);expect(c.getState().detail).toEqual(ready);await vi.advanceTimersByTimeAsync(10000);expect(api.get).toHaveBeenCalledTimes(2);
});
it('60 automatic polls stop without inventing failure; manual recheck allowed',async()=>{
  vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);await vi.advanceTimersByTimeAsync(122000);expect(api.get).toHaveBeenCalledTimes(61);expect(c.getState()).toMatchObject({detail:generating,syncNotice:'状态获取超时，请重新检查'});
  vi.mocked(api.get).mockResolvedValue(ready);await c.recheck();expect(c.getState().detail).toEqual(ready);
});
it('offline pauses budget, online resumes with GET only',async()=>{
  vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);c.online(false);await vi.advanceTimersByTimeAsync(200000);expect(api.get).toHaveBeenCalledTimes(1);expect(c.getState().syncNotice).toBe('网络连接中断，正在等待恢复……');
  c.online(true);await vi.advanceTimersByTimeAsync(0);expect(api.get).toHaveBeenCalledTimes(2);expect(api.generate).not.toHaveBeenCalled();
});
it('network GET failure preserves generating and auto recovery is GET only',async()=>{
  vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);vi.mocked(api.get).mockRejectedValueOnce(new ApiError('private',0));await vi.advanceTimersByTimeAsync(2000);expect(c.getState().detail).toEqual(generating);expect(c.getState().syncNotice).toContain('网络连接中断');vi.mocked(api.get).mockResolvedValue(failed);await vi.advanceTimersByTimeAsync(2000);expect(c.getState().detail).toEqual(failed);
});
it('poll is serial and cancelled on switch/dispose; late results ignored',async()=>{
  vi.useFakeTimers();const wait=deferred<DraftSnapshot>();const {api,c}=setup(generating);await c.select(id);vi.mocked(api.get).mockReturnValueOnce(wait.promise);await vi.advanceTimersByTimeAsync(20000);expect(api.get).toHaveBeenCalledTimes(2);
  vi.mocked(api.get).mockResolvedValue(draft);await c.select('B');wait.resolve(ready);await vi.advanceTimersByTimeAsync(20000);expect(c.getState().selectedId).toBe('B');expect(c.getState().detail).toEqual(draft);c.dispose();await vi.advanceTimersByTimeAsync(20000);expect(api.get).toHaveBeenCalledTimes(3);
});
it('hidden detail pauses and resumes monitoring',async()=>{vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);c.visible(false);await vi.advanceTimersByTimeAsync(6000);expect(api.get).toHaveBeenCalledTimes(1);c.visible(true);await vi.advanceTimersByTimeAsync(2000);expect(api.get).toHaveBeenCalledTimes(2);});
it('uncertain POST resolved by GET failure uses a NEW request/base for actual retry',async()=>{
  const {api,c}=setup(draft,{generate:vi.fn().mockRejectedValueOnce(new ApiError('network',0)).mockResolvedValue(result(generating))});
  await c.select(id);await c.generate();vi.mocked(api.get).mockResolvedValue(failed);await c.recheck();await c.generate();
  const calls=vi.mocked(api.generate).mock.calls;expect(calls[1]![1].requestId).not.toBe(calls[0]![1].requestId);expect(calls[1]![1].expectedGenerationId).toBe(failed.lineupGeneration!.generationId);
});
it('late confirm and failed GET cannot overwrite a newly selected discussion',async()=>{
  const wait=deferred<{discussionId:string;snapshot:DraftSnapshot;replayed:boolean}>();const {api,c}=setup(ready,{confirm:()=>wait.promise});await c.select(id);const a=c.confirm();vi.mocked(api.get).mockResolvedValue(draft);await c.select('B');wait.resolve({discussionId:id,snapshot:confirmed,replayed:false});await a;expect(c.getState()).toMatchObject({selectedId:'B',detail:draft,actionError:'',actionBusy:false});
});
it('poll success after regenerate failure cannot restore older ready snapshot',async()=>{
  const newerFailed={...failed,version:5,lastEventId:5};const {api,c}=setup(newerFailed);await c.select(id);vi.mocked(api.get).mockResolvedValue(ready);await c.recheck();expect(c.getState().detail).toEqual(newerFailed);
});
it('offline recovery respects exhausted automatic budget and hidden detail',async()=>{
  vi.useFakeTimers();const {api,c}=setup(generating);await c.select(id);c.visible(false);c.online(false);c.online(true);await vi.advanceTimersByTimeAsync(0);expect(api.get).toHaveBeenCalledTimes(1);
  c.visible(true);await vi.advanceTimersByTimeAsync(122000);expect(api.get).toHaveBeenCalledTimes(61);c.online(false);c.online(true);await vi.advanceTimersByTimeAsync(0);expect(api.get).toHaveBeenCalledTimes(61);expect(c.getState().syncNotice).toBe('状态获取超时，请重新检查');
});
it('409 GET failure prevents confirming known-stale cards until manual snapshot succeeds',async()=>{
  const {api,c}=setup(ready,{confirm:vi.fn(async()=>{throw new ApiError('conflict',409);})});await c.select(id);vi.mocked(api.get).mockRejectedValueOnce(new ApiError('network',0));await c.confirm();await c.confirm();expect(api.confirm).toHaveBeenCalledTimes(1);
  await c.recheck();await c.confirm();expect(api.confirm).toHaveBeenCalledTimes(2);
});
