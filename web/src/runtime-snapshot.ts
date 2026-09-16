import {isObject,validateUuid} from '../../src/domain/input.js';
import {exactKeys} from '../../src/domain/lineup.js';
import {parseUtterance,parseSynthesis,parseSummary,publicText,type DiscussionInput} from '../../src/domain/discussion.js';
import {runtimeNotice,type DiscussionSnapshot} from '../../src/domain/snapshot.js';
const timestamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const uuid=(v:unknown):v is string=>{try{return validateUuid(v)===v;}catch{return false;}};
export function isRuntimeSnapshot(data:Record<string,unknown>,baseValid:(v:unknown)=>v is DiscussionSnapshot):boolean{
 try{return check(data,baseValid);}catch{return false;}
}
function check(d:Record<string,unknown>,baseValid:(v:unknown)=>v is DiscussionSnapshot):boolean{
 if(!exactKeys(d,['discussionId','topic','expertCount','status','version','updatedAt','createdAt','lastEventId','lineupRevision','confirmedLineupRevision','transcriptVersion','roles','utterances','lastNotice','synthesis','summary','stopReason','startedAt','endedAt','lineupGeneration','confirmedAt','runtime','roleStates','synthesisState']))return false;
 const {runtime,roleStates,synthesisState,...old}=d;
 const base={...old,status:'lineup_confirmed',updatedAt:d.confirmedAt,lastEventId:d.version,transcriptVersion:0,utterances:[],synthesis:null,summary:null,lastNotice:null,stopReason:null,startedAt:null,endedAt:null};
 if(!baseValid(base)||!nonnegative(d.version)||d.version<5||!nonnegative(d.lastEventId)||d.lastEventId<d.version||
  !timestamp(d.updatedAt)||!timestamp(d.confirmedAt)||!timestamp(d.startedAt)||d.confirmedAt>d.startedAt||d.startedAt>d.updatedAt||
  !nonnegative(d.transcriptVersion)||!Array.isArray(d.utterances)||d.utterances.length!==d.transcriptVersion)return false;
 if(!isObject(runtime)||!exactKeys(runtime,['runId','runDeadlineAt','stoppingAt','stopDeadlineAt'])||!uuid(runtime.runId)||!timestamp(runtime.runDeadlineAt)||![120000,600000].includes(Date.parse(runtime.runDeadlineAt)-Date.parse(d.startedAt)))return false;
 const terminal=d.status==='completed'||d.status==='failed',stopped=runtime.stoppingAt!==null;
 if(terminal?(!timestamp(d.endedAt)||d.endedAt<d.startedAt||d.endedAt>d.updatedAt):d.endedAt!==null)return false;
 if(stopped){
  if(!timestamp(runtime.stoppingAt)||runtime.stoppingAt<d.startedAt||runtime.stoppingAt>d.updatedAt||!timestamp(runtime.stopDeadlineAt)||Date.parse(runtime.stopDeadlineAt)!==Date.parse(runtime.stoppingAt)+60000||
   !['user_requested','turn_limit','duration_limit','no_participation','synthesis_unavailable','call_budget_exhausted'].includes(String(d.stopReason)))return false;
 }else if(runtime.stopDeadlineAt!==null||d.stopReason!==null)return false;
 if((d.status==='stopping'||d.status==='completed')&&!stopped||d.status==='running'&&stopped)return false;
 if(!['idle','preparing','ready','failed'].includes(String(synthesisState))||terminal&&synthesisState==='preparing')return false;
 const input:DiscussionInput={discussionId:base.discussionId,topic:base.topic,roles:base.roles,utterances:[],synthesis:null,sourceTranscriptVersion:d.transcriptVersion};
 const ids=new Set<string>();
 for(const [index,u] of d.utterances.entries()){
  if(!isObject(u)||!exactKeys(u,['id','discussionId','roleId','seq','sentences','replyToUtteranceIds','createdAt'])||!uuid(u.id)||ids.has(u.id)||u.discussionId!==base.discussionId||u.seq!==index+1||!timestamp(u.createdAt)||u.createdAt<d.startedAt||u.createdAt>d.updatedAt)return false;
  const member=base.roles.find(m=>m.memberId===u.roleId);if(!member||index===0&&member.role!=='moderator')return false;
  const speech=parseUtterance({sentences:u.sentences,replyToUtteranceIds:u.replyToUtteranceIds},input,index===0?'opening':'expert');ids.add(u.id);
  input.utterances.push({id:u.id,discussionId:base.discussionId,roleId:member.memberId,seq:index+1,...speech,createdAt:u.createdAt});
 }
 if(!Array.isArray(roleStates)||roleStates.length!==base.roles.length)return false;
 for(const [index,r] of roleStates.entries()){
  if(!isObject(r)||!exactKeys(r,['roleId','status','publicFocus','focusSourceTranscriptVersion','updatedAt'])||r.roleId!==base.roles[index]?.memberId||!['idle','preparing','speaking'].includes(String(r.status))||
   !timestamp(r.updatedAt)||r.updatedAt<d.startedAt||r.updatedAt>d.updatedAt||(d.status!=='running'&&r.status!=='idle'))return false;
  if(r.publicFocus===null){if(r.focusSourceTranscriptVersion!==null)return false;}else if(publicText(r.publicFocus,80)!==r.publicFocus||!nonnegative(r.focusSourceTranscriptVersion)||r.focusSourceTranscriptVersion>d.transcriptVersion)return false;
 }
 if(d.synthesis!==null){
  const s=d.synthesis;if(!isObject(s)||!exactKeys(s,['sourceTranscriptVersion','items','updatedAt'])||!nonnegative(s.sourceTranscriptVersion)||s.sourceTranscriptVersion<1||s.sourceTranscriptVersion>d.transcriptVersion||!timestamp(s.updatedAt)||s.updatedAt>d.updatedAt||s.updatedAt<d.startedAt||!Array.isArray(s.items))return false;
  const findingIds=new Set<string>();const candidates=s.items.map((f:unknown)=>{if(!isObject(f)||!exactKeys(f,['id','kind','text','evidenceUtteranceIds','positions'])||!uuid(f.id)||findingIds.has(f.id))throw new Error('INVALID_FINDING');findingIds.add(f.id);return {kind:f.kind,text:f.text,evidenceUtteranceIds:f.evidenceUtteranceIds,positions:f.positions};});
  parseSynthesis({items:candidates},{...input,sourceTranscriptVersion:s.sourceTranscriptVersion});
 }else if(synthesisState==='ready')return false;
 if(d.summary!==null){
  const s=d.summary;if(!isObject(s)||!exactKeys(s,['status','text','sourceTranscriptVersion'])||s.sourceTranscriptVersion!==d.transcriptVersion||!terminal)return false;
  if(s.status==='ready'){if(d.status!=='completed'||parseSummary({text:s.text})!==s.text)return false;}
  else if(s.status!=='unavailable'||s.text!==null)return false;
 }else if(d.status==='completed')return false;
 if(d.lastNotice!==null){
  const n=d.lastNotice;if(!isObject(n)||!exactKeys(n,['code','message','retryable','action'])||typeof n.code!=='string')return false;
  const expected=runtimeNotice(n.code);if(n.message!==expected.message||n.retryable!==expected.retryable||n.action!==expected.action)return false;
 }else if(d.status==='failed'||isObject(d.summary)&&d.summary.status==='unavailable')return false;
 return true;
}
