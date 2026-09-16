import {expect,it} from 'vitest';
import {sample} from './lineup-fixtures.js';
import {EventBatch} from '../src/events.js';
export function startEvents(){
 const s=sample('lineup_confirmed'),time='2026-09-16T00:01:00.000Z';
 const event={discussionId:s.discussionId,eventId:s.lastEventId+1,dataVersion:s.version+1,type:'discussion.status_changed',occurredAt:time,transactionLastEventId:s.lastEventId+1,payload:{status:'running',stopReason:null,startedAt:time,endedAt:null,confirmedLineupRevision:s.lineupRevision,summary:null,lineupRevision:s.lineupRevision,lineupGeneration:s.lineupGeneration,confirmedAt:s.confirmedAt,roles:s.roles,lastNotice:null,runtime:{runId:crypto.randomUUID(),runDeadlineAt:'2026-09-16T00:11:00.000Z',stoppingAt:null,stopDeadlineAt:null},roleStates:s.roles.map(m=>({roleId:m.memberId,status:'idle',publicFocus:null,focusSourceTranscriptVersion:null,updatedAt:time})),synthesisState:'idle'}};
 return {s,event};
}
it('严格解析开始，后续同version多事件只在完整批次时应用',()=>{
 const {s,event}=startEvents();const initial=new EventBatch(s);const running=initial.accept(event);expect(running?.status).toBe('running');
 const batch=new EventBatch(running!);const id=crypto.randomUUID(),role=s.roles[0]!.memberId;
 const first={...event,eventId:event.eventId+1,dataVersion:event.dataVersion+1,transactionLastEventId:event.eventId+2,type:'utterance.created',payload:{utterance:{id,discussionId:s.discussionId,roleId:role,seq:1,sentences:['开场发言。'],replyToUtteranceIds:[],createdAt:event.occurredAt}}};
 expect(batch.accept(first)).toBeNull();expect(batch.snapshot.utterances).toHaveLength(0);
 const second={...first,eventId:first.eventId+1,type:'role.status_changed',payload:{roleId:role,status:'speaking',publicFocus:null,focusSourceTranscriptVersion:null}};
 const result=batch.accept(second)!;expect(result.utterances).toHaveLength(1);expect(result.lastEventId).toBe(second.eventId);expect(batch.accept(second)).toBeNull();
});
it('拒绝跨场、缺口、未知键、同批不一致，不污染原快照',()=>{
 const {s,event}=startEvents();
 for(const invalid of [{...event,discussionId:crypto.randomUUID()},{...event,eventId:event.eventId+2},{...event,private:'secret'},{...event,payload:{...event.payload,reasoning_content:'private'}}]){
  const b=new EventBatch(s);expect(()=>b.accept(invalid)).toThrow();expect(b.snapshot).toEqual(s);
 }
});
