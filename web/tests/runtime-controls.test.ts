import {expect,it,vi} from 'vitest';
import {Controller} from '../src/controller.js';
import {sample} from './lineup-fixtures.js';
import {ApiError,type Api} from '../src/api.js';
const initial=sample('lineup_confirmed');
function setup(){const api:Api={get:vi.fn(async()=>initial),list:async()=>[],create:vi.fn(),generate:vi.fn(),confirm:vi.fn(),start:vi.fn(),stop:vi.fn()};return {api,c:new Controller(api)};}
it('开始互斥且响应未知先GET，不自动重新POST',async()=>{
 const {api,c}=setup();await c.select(initial.discussionId);let reject!:(e:Error)=>void;vi.mocked(api.start).mockImplementation(()=>new Promise((_,no)=>{reject=no;}));
 const first=c.start();await c.start();expect(c.getState().actionBusy).toBe(true);expect(api.start).toHaveBeenCalledTimes(1);
 reject(new ApiError('network',0));await first;expect(api.get).toHaveBeenCalledTimes(2);expect(api.start).toHaveBeenCalledTimes(1);expect(c.getState().detail).toEqual(initial);expect(c.getState().actionBusy).toBe(false);c.dispose();
});
it('409只查询最新状态，切场后旧控制结果不能覆盖',async()=>{
 const {api,c}=setup();await c.select(initial.discussionId);vi.mocked(api.start).mockRejectedValue(new ApiError('conflict',409));await c.start();expect(api.start).toHaveBeenCalledTimes(1);expect(api.get).toHaveBeenCalledTimes(2);expect(c.getState().actionError).toContain('状态');c.dispose();
});
it('同场手动刷新保留已有内容，旧GET不倒退最新已确认快照',async()=>{
 const {api,c}=setup();await c.select(initial.discussionId);let resolve!:(value:typeof initial)=>void;vi.mocked(api.get).mockImplementation(()=>new Promise(yes=>{resolve=yes;}));
 const request=c.select(initial.discussionId);expect(c.getState().detail).toEqual(initial);resolve(sample('awaiting_confirmation'));await request;expect(c.getState().detail).toEqual(initial);c.dispose();
});
it('Effect清理后再次建立仍可操作，但不会在建立时自动POST',async()=>{
 const {api,c}=setup();await c.select(initial.discussionId);c.dispose();c.activate();expect(api.start).not.toHaveBeenCalled();vi.mocked(api.start).mockRejectedValue(new ApiError('network',0));await c.start();expect(api.start).toHaveBeenCalledTimes(1);c.dispose();
});
