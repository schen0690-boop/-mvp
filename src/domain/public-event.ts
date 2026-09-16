import {isObject,validateUuid} from './input.js';
import {exactKeys} from './lineup.js';
export const eventTypes=['discussion.status_changed','role.status_changed','utterance.created','synthesis.status_changed','synthesis.updated','summary.ready','discussion.notice'] as const;
export interface PublicEvent {discussionId:string;eventId:number;dataVersion:number;type:typeof eventTypes[number];occurredAt:string;payload:Record<string,unknown>;transactionLastEventId:number}
function shape(v:unknown,keys:string[]):asserts v is Record<string,unknown>{if(!isObject(v)||!exactKeys(v,keys))throw Error('INVALID_PUBLIC_EVENT');}
function list(v:unknown,check:(v:unknown)=>void){if(!Array.isArray(v))throw Error('INVALID_PUBLIC_EVENT');v.forEach(check);}
const notice=(v:unknown)=>{if(v!==null)shape(v,['code','message','retryable','action']);};
const summary=(v:unknown)=>{if(v!==null)shape(v,['status','text','sourceTranscriptVersion']);};
const roles=(v:unknown)=>list(v,r=>shape(r,['memberId','role','name','profession','title','stance','color','displayOrder']));
const states=(v:unknown)=>list(v,r=>shape(r,['roleId','status','publicFocus','focusSourceTranscriptVersion','updatedAt']));
function synthesis(v:unknown){shape(v,['sourceTranscriptVersion','items','updatedAt']);list(v.items,f=>{shape(f,['id','kind','text','evidenceUtteranceIds','positions']);list(f.positions,p=>shape(p,['text','evidenceUtteranceIds']));});}
export function parsePublicEvent(value:unknown):PublicEvent{
 shape(value,['discussionId','eventId','dataVersion','type','occurredAt','payload','transactionLastEventId']);validateUuid(value.discussionId);
 for(const k of ['eventId','dataVersion','transactionLastEventId'])if(typeof value[k]!=='number'||!Number.isSafeInteger(value[k])||value[k]<1)throw Error('INVALID_PUBLIC_EVENT');
 if(typeof value.type!=='string'||!eventTypes.includes(value.type as PublicEvent['type'])||typeof value.occurredAt!=='string'||!Number.isFinite(Date.parse(value.occurredAt))||new Date(value.occurredAt).toISOString()!==value.occurredAt)throw Error('INVALID_PUBLIC_EVENT');
 if(Number(value.transactionLastEventId)<Number(value.eventId)||Number(value.transactionLastEventId)-Number(value.eventId)>=32)throw Error('INVALID_PUBLIC_EVENT');
 const p=value.payload;
 switch(value.type){
  case 'discussion.status_changed':{
   if(!isObject(p))throw Error('INVALID_PUBLIC_EVENT');
   const keys=['status','stopReason','startedAt','endedAt','confirmedLineupRevision','summary'];
   if('lineupGeneration' in p)keys.push('lineupRevision','lineupGeneration','confirmedAt','roles','lastNotice');
   if('runtime' in p)keys.push('runtime','roleStates','synthesisState');shape(p,keys);summary(p.summary);
   if('roles' in p){roles(p.roles);notice(p.lastNotice);if(p.lineupGeneration!==null)shape(p.lineupGeneration,['generationId','generationVersion','startedAt','finishedAt']);}
   if('runtime' in p){shape(p.runtime,['runId','runDeadlineAt','stoppingAt','stopDeadlineAt']);states(p.roleStates);}break;
  }
  case 'role.status_changed':shape(p,['roleId','status','publicFocus','focusSourceTranscriptVersion']);break;
  case 'utterance.created':shape(p,['utterance']);shape(p.utterance,['id','discussionId','roleId','seq','sentences','replyToUtteranceIds','createdAt']);break;
  case 'synthesis.status_changed':shape(p,['state']);break;
  case 'synthesis.updated':shape(p,['synthesis']);synthesis(p.synthesis);break;
  case 'summary.ready':shape(p,['summary']);summary(p.summary);if(!isObject(p.summary)||p.summary.status!=='ready')throw Error('INVALID_PUBLIC_EVENT');break;
  case 'discussion.notice':shape(p,['notice']);notice(p.notice);break;
 }
 return value as unknown as PublicEvent;
}
