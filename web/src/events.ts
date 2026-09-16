import {decodeSnapshot,type DraftSnapshot} from './api.js';
import {parsePublicEvent,type PublicEvent} from '../../src/domain/public-event.js';
import {isObject} from '../../src/domain/input.js';
export class EventBatch {
 private pending:PublicEvent[]=[];
 constructor(public snapshot:DraftSnapshot){}
 accept(raw:unknown):DraftSnapshot|null{
  const event=parsePublicEvent(raw),s=this.snapshot;
  if(event.discussionId!==s.discussionId)throw Error('EVENT_DISCUSSION');
  if(event.eventId<=s.lastEventId)return null;
  const duplicate=this.pending.find(e=>e.eventId===event.eventId);if(duplicate){if(JSON.stringify(duplicate)!==JSON.stringify(event))throw Error('EVENT_DUPLICATE');return null;}
  if(event.eventId!==s.lastEventId+this.pending.length+1||event.dataVersion!==s.version+1||event.occurredAt<s.updatedAt)throw Error('EVENT_GAP');
  const first=this.pending[0];if(first&&(first.dataVersion!==event.dataVersion||first.transactionLastEventId!==event.transactionLastEventId||first.occurredAt!==event.occurredAt))throw Error('EVENT_BATCH');
  this.pending.push(event);if(this.pending.length>32||new TextEncoder().encode(JSON.stringify(this.pending)).length>262144)throw Error('EVENT_LIMIT');
  if(event.eventId!==event.transactionLastEventId)return null;
  const next:Record<string,unknown>={...structuredClone(s)};
  for(const e of this.pending){const p=e.payload;
   switch(e.type){
    case 'discussion.status_changed':Object.assign(next,p);break;
    case 'utterance.created':{
     const u=p.utterance;if(!isObject(u)||!Array.isArray(next.utterances)||u.seq!==next.utterances.length+1)throw Error('EVENT_UTTERANCE');
     next.utterances.push(u);next.transcriptVersion=u.seq;break;
    }
    case 'role.status_changed':{
     if(!Array.isArray(next.roleStates)||!next.roleStates.some(r=>isObject(r)&&r.roleId===p.roleId))throw Error('EVENT_ROLE');
     next.roleStates=next.roleStates.map(r=>isObject(r)&&r.roleId===p.roleId?{...p,updatedAt:e.occurredAt}:r);break;
    }
    case 'synthesis.status_changed':next.synthesisState=p.state;break;
    case 'synthesis.updated':{
     if(!isObject(p.synthesis)||isObject(next.synthesis)&&Number(p.synthesis.sourceTranscriptVersion)<=Number(next.synthesis.sourceTranscriptVersion))throw Error('EVENT_SYNTHESIS');
     next.synthesis=p.synthesis;next.synthesisState='ready';break;
    }
    case 'summary.ready':next.summary=p.summary;break;
    case 'discussion.notice':next.lastNotice=p.notice;break;
   }
  }
  next.version=event.dataVersion;next.lastEventId=event.eventId;next.updatedAt=event.occurredAt;
  const valid=decodeSnapshot(next);this.snapshot=valid;this.pending=[];return valid;
 }
}
