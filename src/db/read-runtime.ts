import type {DatabaseSync,SQLOutputValue} from 'node:sqlite';
import type {DiscussionSnapshot} from '../domain/snapshot.js';
import {runtimeNotice} from '../domain/snapshot.js';
import {text,integer,nullableText} from './read-discussion.js';
import {parseUtterance,parseSynthesis,parseSummary,type DiscussionInput} from '../domain/discussion.js';
import {isObject} from '../domain/input.js';
export function readRuntime(db:DatabaseSync,r:Record<string,SQLOutputValue>,s:DiscussionSnapshot):void{
 s.transcriptVersion=integer(r.transcript_version);s.startedAt=text(r.started_at);s.endedAt=nullableText(r.ended_at);
 s.runtime={runId:text(r.run_id),runDeadlineAt:text(r.run_deadline_at),stoppingAt:nullableText(r.stopping_at),stopDeadlineAt:nullableText(r.stop_deadline_at)};
 const reason=nullableText(r.stop_reason);
 if(reason!==null&&reason!=='user_requested'&&reason!=='turn_limit'&&reason!=='duration_limit'&&reason!=='no_participation'&&reason!=='synthesis_unavailable'&&reason!=='call_budget_exhausted')throw new Error('INVALID_STOP_REASON');s.stopReason=reason;
 const state=r.synthesis_state;if(state!=='idle'&&state!=='preparing'&&state!=='ready'&&state!=='failed')throw new Error('INVALID_SYNTHESIS_STATE');s.synthesisState=state;
 const input:DiscussionInput={discussionId:s.discussionId,topic:s.topic,roles:s.roles,utterances:[],synthesis:null,sourceTranscriptVersion:s.transcriptVersion};
 for(const u of db.prepare('SELECT * FROM utterances WHERE discussion_id=? ORDER BY seq').all(s.discussionId)){
  const roleId=text(u.role_id);const role=s.roles.find(m=>m.memberId===roleId);if(!role)throw new Error('INVALID_ROLE');
  const speech=parseUtterance({sentences:JSON.parse(text(u.sentences_json)),replyToUtteranceIds:JSON.parse(text(u.reply_ids_json))},input,integer(u.seq)===1?'opening':'expert');
  input.utterances.push({id:text(u.id),discussionId:s.discussionId,roleId,seq:integer(u.seq),...speech,createdAt:text(u.created_at)});
 }
 s.utterances=input.utterances;
 if(s.utterances.length!==s.transcriptVersion)throw new Error('INVALID_TRANSCRIPT_VERSION');
 if(r.synthesis_source_version!==null){
  const rows=db.prepare('SELECT * FROM findings WHERE discussion_id=? ORDER BY rowid').all(s.discussionId);
  const source=integer(r.synthesis_source_version);
  const items=parseSynthesis({items:rows.map(f=>({kind:f.kind,text:f.text,positions:JSON.parse(text(f.positions_json)),evidenceUtteranceIds:[...new Set(db.prepare('SELECT utterance_id FROM finding_evidence WHERE discussion_id=? AND finding_id=? ORDER BY rowid').all(s.discussionId,text(f.id)).map(e=>text(e.utterance_id)))]}))},{...input,sourceTranscriptVersion:source});
  s.synthesis={sourceTranscriptVersion:source,updatedAt:text(r.synthesis_updated_at),items:items.map((f,i)=>({...f,id:text(rows[i]?.id)}))};
 }
 if(r.summary_json!==null){const value:unknown=JSON.parse(text(r.summary_json));if(!isObject(value)||!Number.isSafeInteger(value.sourceTranscriptVersion)||value.sourceTranscriptVersion!==s.transcriptVersion)throw new Error('INVALID_SUMMARY');
  if(value.status==='ready')s.summary={status:'ready',text:parseSummary({text:value.text}),sourceTranscriptVersion:s.transcriptVersion};
  else if(value.status==='unavailable'&&value.text===null)s.summary={status:'unavailable',text:null,sourceTranscriptVersion:s.transcriptVersion};else throw new Error('INVALID_SUMMARY');
 }
 s.lastNotice=r.runtime_notice_code===null?null:runtimeNotice(text(r.runtime_notice_code));
 s.roleStates=db.prepare('SELECT p.* FROM role_public_states p JOIN lineup_members m ON m.member_id=p.member_id AND m.discussion_id=p.discussion_id WHERE p.discussion_id=? ORDER BY m.display_order').all(s.discussionId).map(p=>{
  const status=p.status;if(status!=='idle'&&status!=='preparing'&&status!=='speaking')throw new Error('INVALID_ROLE_STATE');
  return {roleId:text(p.member_id),status,publicFocus:nullableText(p.public_focus),focusSourceTranscriptVersion:p.focus_source_transcript_version===null?null:integer(p.focus_source_transcript_version),updatedAt:text(p.updated_at)};
 });
}
