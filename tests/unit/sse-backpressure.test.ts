import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import type {Request,Response} from 'express';
import {serveEvents} from '../../src/http/events.js';
import {SqliteEventSource} from '../../src/db/public-events.js';
import {subscriberCount} from '../../src/db/commit-notifications.js';
import {discussionFixture} from '../helpers/discussion.js';
afterEach(()=>vi.useRealTimers());
it('write=false停止读写，drain可继续；10秒无drain清理，心跳不改业务版本',async()=>{
 const f=await discussionFixture(1);vi.useFakeTimers({toFake:['setInterval','setTimeout','clearInterval','clearTimeout']});
 const response=new EventEmitter();const frames:string[]=[];let accepts=false,ended=false;
 Object.assign(response,{status(){return response;},set(){return response;},flushHeaders(){},write(s:string){frames.push(s);return accepts;},end(){ended=true;response.emit('close');}});
 const req={params:{discussionId:f.id},query:{after:String(f.confirmed.lastEventId)},get:()=>undefined} as unknown as Request;
 try{serveEvents(req,response as unknown as Response,new SqliteEventSource(f.db));await Promise.resolve();
 await vi.advanceTimersByTimeAsync(15000);expect(frames).toEqual([': heartbeat\n\n']);expect(f.store.state(f.id)!.snapshot).toEqual(f.confirmed);
 f.store.begin(f.id,f.input);await Promise.resolve();expect(frames).toHaveLength(1);accepts=true;response.emit('drain');await Promise.resolve();await Promise.resolve();expect(frames[1]).toContain('discussion.status_changed');
 accepts=false;await vi.advanceTimersByTimeAsync(15000);await vi.advanceTimersByTimeAsync(10000);expect(ended).toBe(true);expect(subscriberCount(f.db)).toBe(0);expect(vi.getTimerCount()).toBe(0);
 }finally{response.emit('close');f.db.close();}
});
