import type {DatabaseSync} from 'node:sqlite';
import {onCommit} from './commit-notifications.js';
import {readSnapshot,transaction,text,integer} from './read-discussion.js';
import {parsePublicEvent,type PublicEvent} from '../domain/public-event.js';
import {AppError} from '../domain/errors.js';
export type ResetReason='cursor_ahead'|'history_unavailable'|'partial_transaction';
export class SqliteEventSource {
 constructor(private readonly db:DatabaseSync){}
 subscribe(listener:()=>void){return onCommit(this.db,listener);}
 read(id:string,after:number):{status:string;highWater:number;events:PublicEvent[];reset?:ResetReason}{
  return transaction(this.db,()=>{
   const snapshot=readSnapshot(this.db,id);if(!snapshot)throw new AppError('NOT_FOUND','未找到讨论',404);
   const base={status:snapshot.status,highWater:snapshot.lastEventId,events:[] as PublicEvent[]};
   if(after>base.highWater)return {...base,reset:'cursor_ahead'};
   if(after){const previous=this.db.prepare('SELECT data_version FROM public_events WHERE discussion_id=? AND event_id=?').get(id,after);
    if(!previous)return {...base,reset:'history_unavailable'};
    const next=this.db.prepare('SELECT data_version FROM public_events WHERE discussion_id=? AND event_id=?').get(id,after+1);
    if(next?.data_version===previous.data_version)return {...base,reset:'partial_transaction'};
   }
   const rows=this.db.prepare('SELECT e.*, (SELECT MAX(event_id) FROM public_events b WHERE b.discussion_id=e.discussion_id AND b.data_version=e.data_version) AS batch_end FROM public_events e WHERE discussion_id=? AND event_id>? ORDER BY event_id LIMIT 32').all(id,after);
   let expected=after+1;
   for(const r of rows){if(integer(r.event_id)!==expected++)return {...base,reset:'history_unavailable'};
    if(integer(r.batch_end)>after+32)break;
    const payload=text(r.payload);if(Buffer.byteLength(payload)>65536)throw Error('INVALID_PUBLIC_EVENT');
    base.events.push(parsePublicEvent({discussionId:id,eventId:integer(r.event_id),dataVersion:integer(r.data_version),type:text(r.type),occurredAt:text(r.occurred_at),payload:JSON.parse(payload),transactionLastEventId:integer(r.batch_end)}));
   }
   if(after<base.highWater&&!base.events.length)return {...base,reset:'history_unavailable'};
   if(base.events.length&&base.events.at(-1)!.eventId!==base.events.at(-1)!.transactionLastEventId)return {...base,events:[],reset:'history_unavailable'};
   return base;
  },false);
 }
}
