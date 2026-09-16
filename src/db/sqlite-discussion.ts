import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import type {DiscussionStore,RunKey,RunState} from '../domain/discussion-store.js';
import {AppError} from '../domain/errors.js';
import {callBudget,parseUtterance,parseSynthesis,parseSummary,type DiscussionInput,type StopReason} from '../domain/discussion.js';
import {runtimeNotice} from '../domain/snapshot.js';
import {readSnapshot,transaction,text,integer,nullableText} from './read-discussion.js';
interface Event {type:string;payload:unknown}
const now=()=>new Date().toISOString();
export class SqliteDiscussionStore implements DiscussionStore {
 constructor(private readonly db:DatabaseSync){}
 state:DiscussionStore['state']=id=>transaction(this.db,()=>{
  const snapshot=readSnapshot(this.db,id);if(!snapshot)return undefined;
  const r=this.db.prepare('SELECT * FROM discussions WHERE id=?').get(id)!;
  return {snapshot,key:{discussionId:id,runId:nullableText(r.run_id)??'',epoch:integer(r.run_epoch),sourceTranscriptVersion:integer(r.transcript_version)},
   requestId:nullableText(r.start_request_id),callsUsed:integer(r.calls_used),callLimit:integer(r.call_limit),summaryCallsUsed:integer(r.summary_calls_used),expertTurns:integer(r.expert_turn_count)};
 },false);
 begin:DiscussionStore['begin']=(id,input)=>transaction(this.db,()=>{
  const st=this.state(id);if(!st)throw new AppError('NOT_FOUND','未找到讨论',404);
  const s=st.snapshot,bound=s.lineupGeneration?.generationId===input.generationId&&s.lineupRevision===input.lineupRevision&&s.confirmedLineupRevision===input.lineupRevision;
  const result=(replayed:boolean)=>({discussionId:id,runId:text(this.db.prepare('SELECT run_id FROM discussions WHERE id=?').get(id)?.run_id),snapshot:this.state(id)!.snapshot,replayed});
  if(st.requestId===input.requestId){if(!bound)throw new AppError('IDEMPOTENCY_CONFLICT','请求标识与阵容不匹配',409);return result(true);}
  if(s.status==='completed'||s.status==='failed')throw new AppError('INVALID_STATE','已结束的讨论不能重新开始',409);
  if(!['lineup_confirmed','running','stopping'].includes(s.status))throw new AppError('LINEUP_NOT_READY','阵容尚未确认',409);
  if(!bound)throw new AppError('STALE_LINEUP','阵容版本已更新',409);
  if(s.status!=='lineup_confirmed')return result(true);
  if(integer(this.db.prepare("SELECT COUNT(*) AS n FROM discussions WHERE status IN ('running','stopping')").get()?.n)>=2)throw new AppError('CAPACITY_REACHED','讨论运行容量已满',429);
  if(s.roles.length!==s.expertCount+1||s.roles.filter(m=>m.role==='moderator').length!==1)throw new Error('INVALID_CONFIRMED_ROLES');
  const time=now(),runId=randomUUID();
  this.db.prepare("UPDATE discussions SET status='running',run_id=?,start_request_id=?,run_epoch=1,started_at=?,run_deadline_at=?,call_limit=? WHERE id=? AND status='lineup_confirmed'")
   .run(runId,input.requestId,time,new Date(Date.parse(time)+600000).toISOString(),callBudget(s.expertCount),id);
  for(const m of s.roles)this.db.prepare("INSERT INTO role_public_states VALUES (?,?,'idle',NULL,NULL,?)").run(id,m.memberId,time);
  this.events(id,[{type:'discussion.status_changed',payload:null}],time);return result(false);
 });
 private current(key:RunKey,summary=false,allowExpired=false):RunState|undefined{
  const s=this.state(key.discussionId);if(!s||s.key.runId!==key.runId||s.key.epoch!==key.epoch||s.key.sourceTranscriptVersion!==key.sourceTranscriptVersion||s.snapshot.status!==(summary?'stopping':'running'))return undefined;
  const end=summary?s.snapshot.runtime?.stopDeadlineAt:s.snapshot.runtime?.runDeadlineAt;
  if(!allowExpired&&(!end||Date.now()>=Date.parse(end)))return undefined;return s;
 }
 reserve:DiscussionStore['reserve']=(key,summary)=>transaction(this.db,()=>{
  const s=this.current(key,summary);if(!s)return false;
  const limit=summary?s.callLimit:s.callLimit-2;if(s.callsUsed>=limit||summary&&s.summaryCallsUsed>=2)return false;
  this.db.prepare('UPDATE discussions SET calls_used=calls_used+1,summary_calls_used=summary_calls_used+? WHERE id=?').run(summary?1:0,key.discussionId);return true;
 });
 role:DiscussionStore['role']=(key,roleId,status,focus)=>transaction(this.db,()=>{
  const s=this.current(key);if(!s)return false;
  const previous=s.snapshot.roleStates?.find(r=>r.roleId===roleId);if(!previous)throw new Error('INVALID_ROLE');
  const publicFocus=focus===undefined?previous.publicFocus:focus,source=focus===undefined?previous.focusSourceTranscriptVersion:focus===null?null:key.sourceTranscriptVersion;
  if(previous.status===status&&previous.publicFocus===publicFocus&&previous.focusSourceTranscriptVersion===source)return true;
  const time=now();this.db.prepare('UPDATE role_public_states SET status=?,public_focus=?,focus_source_transcript_version=?,updated_at=? WHERE discussion_id=? AND member_id=?').run(status,publicFocus,source,time,key.discussionId,roleId);
  this.events(key.discussionId,[{type:'role.status_changed',payload:{roleId,status,publicFocus,focusSourceTranscriptVersion:source}}],time);return true;
 });
 private input(s:RunState):DiscussionInput{return {...s.snapshot,sourceTranscriptVersion:s.key.sourceTranscriptVersion};}
 private resultTransaction(key:RunKey,summary:boolean,work:()=>boolean,allowExpired=false):boolean{
  const expired=Symbol('expired-result');
  try{return transaction(this.db,()=>{
   const initial=this.current(key,summary,allowExpired);if(!initial)return false;
   const deadline=summary?initial.snapshot.runtime!.stopDeadlineAt!:initial.snapshot.runtime!.runDeadlineAt;
   const result=work();
   // A result can change status/epoch itself; recheck its original deadline before COMMIT.
   if(!allowExpired&&Date.now()>=Date.parse(deadline))throw expired;
   return result;
  });}catch(error){if(error===expired)return false;throw error;}
 }
 append:DiscussionStore['append']=(key,roleId,speech)=>this.resultTransaction(key,false,()=>{
  const s=this.current(key);if(!s)return false;
  const member=s.snapshot.roles.find(m=>m.memberId===roleId);if(!member)throw new Error('INVALID_ROLE');
  if(!s.snapshot.utterances.length&&member.role!=='moderator')throw new Error('OPENING_REQUIRES_MODERATOR');
  const parsed=parseUtterance(speech,this.input(s),!s.snapshot.utterances.length?'opening':'expert'),time=now();
  const u={id:randomUUID(),discussionId:key.discussionId,roleId,seq:key.sourceTranscriptVersion+1,...parsed,createdAt:time};
  this.db.prepare('INSERT INTO utterances VALUES (?,?,?,?,?,?,?,?)').run(u.id,u.discussionId,key.runId,roleId,u.seq,JSON.stringify(u.sentences),JSON.stringify(u.replyToUtteranceIds),time);
  this.db.prepare('UPDATE discussions SET transcript_version=transcript_version+1,expert_turn_count=expert_turn_count+? WHERE id=?').run(member.role==='expert'?1:0,u.discussionId);
  this.db.prepare("UPDATE role_public_states SET status='speaking',updated_at=? WHERE discussion_id=? AND member_id=?").run(time,u.discussionId,roleId);
  const role=this.state(u.discussionId)!.snapshot.roleStates!.find(r=>r.roleId===roleId)!;
  const events:Event[]=[{type:'utterance.created',payload:{utterance:u}},{type:'role.status_changed',payload:{roleId,status:role.status,publicFocus:role.publicFocus,focusSourceTranscriptVersion:role.focusSourceTranscriptVersion}}];
  if(member.role==='expert'&&s.expertTurns+1>=12){this.stopMutation(u.discussionId,'turn_limit',time);events.push({type:'discussion.status_changed',payload:null});}
  this.events(u.discussionId,events,time);return true;
 });
 synthesisStatus:DiscussionStore['synthesisStatus']=(key,status)=>transaction(this.db,()=>{
  if(!this.current(key))return false;
  this.db.prepare('UPDATE discussions SET synthesis_state=?,runtime_notice_code=? WHERE id=?').run(status,status==='failed'?'SYNTHESIS_UNAVAILABLE':null,key.discussionId);
  this.events(key.discussionId,[{type:'synthesis.status_changed',payload:{state:status}},{type:'discussion.notice',payload:{notice:status==='failed'?runtimeNotice('SYNTHESIS_UNAVAILABLE'):null}}],now());return true;
 });
 synthesize:DiscussionStore['synthesize']=(key,items)=>this.resultTransaction(key,false,()=>{
  const s=this.current(key);if(!s||s.snapshot.synthesis&&s.snapshot.synthesis.sourceTranscriptVersion>=key.sourceTranscriptVersion)return false;
  const valid=parseSynthesis({items},this.input(s)),id=key.discussionId,time=now();
  this.db.prepare('DELETE FROM finding_evidence WHERE discussion_id=?').run(id);this.db.prepare('DELETE FROM findings WHERE discussion_id=?').run(id);
  for(const item of valid){const findingId=randomUUID();this.db.prepare('INSERT INTO findings VALUES (?,?,?,?,?,?,?)').run(findingId,id,key.runId,item.kind,item.text,JSON.stringify(item.positions),key.sourceTranscriptVersion);
   const positions=item.kind==='consensus'?[{evidenceUtteranceIds:item.evidenceUtteranceIds}]:item.positions;
   positions.forEach((p,index)=>{for(const evidence of p.evidenceUtteranceIds)this.db.prepare('INSERT INTO finding_evidence VALUES (?,?,?,?)').run(id,findingId,evidence,item.kind==='consensus'?0:index+1);});
  }
  this.db.prepare("UPDATE discussions SET synthesis_source_version=?,synthesis_updated_at=?,synthesis_state='ready',runtime_notice_code=NULL WHERE id=?").run(key.sourceTranscriptVersion,time,id);
  this.events(id,[{type:'synthesis.updated',payload:{synthesis:this.state(id)!.snapshot.synthesis}},{type:'discussion.notice',payload:{notice:null}}],time);return true;
 });
 private stopMutation(id:string,reason:StopReason,time:string):void{
  this.db.prepare("UPDATE discussions SET status='stopping',run_epoch=run_epoch+1,stop_reason=?,stopping_at=?,stop_deadline_at=?,frozen_transcript_version=transcript_version,synthesis_state=CASE WHEN synthesis_state='preparing' THEN 'failed' ELSE synthesis_state END WHERE id=? AND status='running'").run(reason,time,new Date(Date.parse(time)+60000).toISOString(),id);
  this.db.prepare("UPDATE role_public_states SET status='idle',updated_at=? WHERE discussion_id=?").run(time,id);
 }
 stop:DiscussionStore['stop']=(id,reason)=>transaction(this.db,()=>{
  const s=this.state(id);if(!s)throw new AppError('NOT_FOUND','未找到讨论',404);
  if(['stopping','completed','failed'].includes(s.snapshot.status))return s.snapshot;
  if(s.snapshot.status!=='running')throw new AppError('INVALID_STATE','当前讨论尚未运行',409);
  const time=now();this.stopMutation(id,reason,time);this.events(id,[{type:'discussion.status_changed',payload:null}],time);return this.state(id)!.snapshot;
 });
 finish:DiscussionStore['finish']=(key,summaryText)=>this.resultTransaction(key,true,()=>{
  const s=this.current(key,true,summaryText===null);if(!s)return false;
  const summary={status:summaryText===null?'unavailable':'ready',text:summaryText===null?null:parseSummary({text:summaryText}),sourceTranscriptVersion:key.sourceTranscriptVersion};
  const time=now(),code=summaryText===null?(s.snapshot.utterances.length?'SUMMARY_UNAVAILABLE':'SUMMARY_NO_CONTENT'):null;
  this.db.prepare("UPDATE discussions SET status='completed',summary_json=?,runtime_notice_code=?,ended_at=? WHERE id=?").run(JSON.stringify(summary),code,time,key.discussionId);
  const events:Event[]=summaryText===null?[]:[{type:'summary.ready',payload:{summary}}];events.push({type:'discussion.status_changed',payload:null});this.events(key.discussionId,events,time);return true;
 },summaryText===null);
 fail:DiscussionStore['fail']=(id,code)=>transaction(this.db,()=>{
  runtimeNotice(code);const s=this.state(id);if(!s||!['running','stopping'].includes(s.snapshot.status))return;
  const time=now(),summary=s.snapshot.status==='stopping'?JSON.stringify({status:'unavailable',text:null,sourceTranscriptVersion:s.key.sourceTranscriptVersion}):null;
  this.db.prepare("UPDATE discussions SET status='failed',run_epoch=run_epoch+1,ended_at=?,runtime_notice_code=?,summary_json=?,synthesis_state=CASE WHEN synthesis_state='preparing' THEN 'failed' ELSE synthesis_state END WHERE id=?").run(time,code,summary,id);
  this.db.prepare("UPDATE role_public_states SET status='idle',updated_at=? WHERE discussion_id=?").run(time,id);
  this.events(id,[{type:'discussion.status_changed',payload:null}],time);
 });
 recover:DiscussionStore['recover']=()=>transaction(this.db,()=>{
  for(const r of this.db.prepare("SELECT id FROM discussions WHERE status IN ('running','stopping')").all())this.fail(text(r.id),'RUN_INTERRUPTED');
 });
 private events(id:string,events:Event[],time:string):void{
  this.db.prepare('UPDATE discussions SET version=version+1,last_event_id=last_event_id+?,updated_at=? WHERE id=?').run(events.length,time,id);
  const s=this.state(id)!.snapshot;
  for(const [i,event] of events.entries()){
   const payload=event.type==='discussion.status_changed'?{status:s.status,stopReason:s.stopReason,startedAt:s.startedAt,endedAt:s.endedAt,confirmedLineupRevision:s.confirmedLineupRevision,summary:s.summary,lineupRevision:s.lineupRevision,lineupGeneration:s.lineupGeneration,confirmedAt:s.confirmedAt,roles:s.roles,lastNotice:s.lastNotice,runtime:s.runtime,roleStates:s.roleStates,synthesisState:s.synthesisState}:event.payload;
   const encoded=JSON.stringify(payload);if(Buffer.byteLength(encoded)>65536)throw new Error('EVENT_TOO_LARGE');
   this.db.prepare('INSERT INTO public_events VALUES (?,?,?,?,?,?)').run(id,s.lastEventId-events.length+i+1,s.version,event.type,time,encoded);
  }
 }
}
