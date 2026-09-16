import {afterEach,expect,it,vi} from 'vitest';
import {discussionFixture} from '../helpers/discussion.js';
import {SqliteDiscussionStore} from '../../src/db/sqlite-discussion.js';
import {DiscussionService} from '../../src/domain/discussion-service.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const c of cleanup.splice(0).reverse())await c();vi.useRealTimers();});
it('仅后端绑定run使用2专家/120秒：9次能力调用、一次中途提炼、一次总结',async()=>{
 const f=await discussionFixture(2),runId=crypto.randomUUID();let claims=0,calls=0,synthesis=0,summary=0;const normal=new FakeDiscussionProvider();
 const store=new SqliteDiscussionStore(f.db,{discussionId:f.id,runId,expertTurns:2,runDurationMs:120000,beforeStart:()=>{claims++;}});
 const p=new FakeDiscussionProvider({assessIntent:async(i,c)=>{calls++;return normal.assessIntent(i,c);},generateUtterance:async(i,c)=>{calls++;return normal.generateUtterance(i,c);},extractSynthesis:async(i,c)=>{calls++;synthesis++;return normal.extractSynthesis(i,c);},summarize:async(i,c)=>{calls++;summary++;return normal.summarize(i,c);}}),service=new DiscussionService(store,p);
 cleanup.push(async()=>{await service.close();f.db.close();});const start=service.start(f.id,f.input);service.start(f.id,f.input);await service.idle();const s=f.drafts.get(f.id);
 expect(start.runId).toBe(runId);expect(Date.parse(s.runtime!.runDeadlineAt)-Date.parse(s.startedAt!)).toBe(120000);expect(s).toMatchObject({status:'completed',transcriptVersion:3,summary:{status:'ready',sourceTranscriptVersion:3},synthesis:{sourceTranscriptVersion:2}});expect([claims,calls,synthesis,summary]).toEqual([1,9,1,1]);expect(store.state(f.id)!.callLimit).toBe(112);
});
it('120秒普通期限包含排队/重试，独立60秒收尾不沿用普通取消域',async()=>{
 const f=await discussionFixture(2),store=new SqliteDiscussionStore(f.db,{discussionId:f.id,runId:crypto.randomUUID(),expertTurns:2,runDurationMs:120000,beforeStart:()=>{}});const normal=new FakeDiscussionProvider();
 const service=new DiscussionService(store,new FakeDiscussionProvider({generateUtterance:async(i,c)=>{await new Promise(r=>setTimeout(r,29000));return normal.generateUtterance(i,c);},assessIntent:async(i,c)=>{await new Promise(r=>setTimeout(r,29000));return normal.assessIntent(i,c);},summarize:async(_i,c)=>{expect(c.signal.aborted).toBe(false);return new Promise(()=>{});}}));cleanup.push(async()=>{await service.close();f.db.close();});vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});service.start(f.id,f.input);await vi.advanceTimersByTimeAsync(120000);expect(f.drafts.get(f.id).status).toBe('stopping');const s=f.drafts.get(f.id);expect(Date.parse(s.runtime!.stopDeadlineAt!)-Date.parse(s.runtime!.stoppingAt!)).toBe(60000);await vi.advanceTimersByTimeAsync(60000);await service.idle();expect(f.drafts.get(f.id)).toMatchObject({status:'completed',stopReason:'duration_limit',summary:{status:'unavailable'}});
});
