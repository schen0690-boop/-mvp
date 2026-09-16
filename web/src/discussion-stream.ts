import {eventTypes} from '../../src/domain/public-event.js';
import {isObject} from '../../src/domain/input.js';
import {exactKeys} from '../../src/domain/lineup.js';
import {EventBatch} from './events.js';
import {decodeSnapshot,type DraftSnapshot} from './api.js';
export type ConnectionState='connecting'|'live'|'recovering'|'manual'|'closed';
export interface StreamConnection {addEventListener(type:string,listener:EventListener):void;close():void}
export type StreamFactory=(url:string)=>StreamConnection;
export class DiscussionStream {
 private source:StreamConnection|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private abort:AbortController|undefined;
 private token=0;private disposed=false;private failures=0;private batch:EventBatch;
 constructor(snapshot:DraftSnapshot,private readonly get:(id:string,signal:AbortSignal)=>Promise<DraftSnapshot>,private readonly adopt:(s:DraftSnapshot)=>void,private readonly status:(s:ConnectionState)=>void,private readonly factory:StreamFactory=url=>new EventSource(url)){
  this.batch=new EventBatch(snapshot);this.open();
 }
 private stopConnection(){this.token++;this.source?.close();this.source=undefined;this.abort?.abort();this.abort=undefined;clearTimeout(this.timer);this.timer=undefined;}
 private terminal(){return ['completed','failed'].includes(this.batch.snapshot.status);}
 replace(snapshot:DraftSnapshot){if(snapshot.discussionId!==this.batch.snapshot.discussionId||snapshot.version<this.batch.snapshot.version)return;this.stopConnection();this.batch=new EventBatch(snapshot);this.open();}
 private open(){
  if(this.disposed)return;if(this.terminal()){this.stopConnection();this.status('closed');return;}
  const token=++this.token,s=this.batch.snapshot;this.status('connecting');
  try{
   const source=this.factory(`/api/discussions/${s.discussionId}/events?after=${s.lastEventId}`);this.source=source;
   const active=()=>!this.disposed&&token===this.token;
   source.addEventListener('open',()=>{if(active())this.status('live');});
   source.addEventListener('error',()=>{if(active())this.recover();});
   for(const type of eventTypes)source.addEventListener(type,(raw:Event)=>{
    if(!active())return;
    try{const message=raw as MessageEvent<string>,value:unknown=JSON.parse(message.data);
     if(!isObject(value)||value.type!==type||message.lastEventId!==`${s.discussionId}:${value.eventId}`)throw Error('EVENT_ENVELOPE');
     const next=this.batch.accept(value);if(next){this.failures=0;this.adopt(next);if(this.terminal()){this.stopConnection();this.status('closed');}}
    }catch{this.recover();}
   });
   source.addEventListener('stream.reset',(raw:Event)=>{if(!active())return;try{const v:unknown=JSON.parse((raw as MessageEvent<string>).data);if(!isObject(v)||!exactKeys(v,['reason','snapshotPath'])||!['cursor_ahead','history_unavailable','partial_transaction'].includes(String(v.reason))||v.snapshotPath!==`/api/discussions/${s.discussionId}`)throw Error('RESET');}catch{/* Invalid control messages use the same bounded read-only recovery. */}this.recover();});
   source.addEventListener('stream.end',()=>{if(active()){if(this.terminal()){this.stopConnection();this.status('closed');}else this.recover();}});
  }catch{this.recover();}
 }
 private recover(){
  if(this.disposed)return;this.stopConnection();this.batch=new EventBatch(this.batch.snapshot);
  if(this.failures>=5){this.status('manual');return;}const delay=[1000,2000,4000,8000,10000][this.failures++]!;this.status('recovering');
  this.timer=setTimeout(()=>{void this.read();},delay);
 }
 private async read(){
  const token=this.token,abort=new AbortController();this.abort=abort;
  try{const snapshot=decodeSnapshot(await this.get(this.batch.snapshot.discussionId,abort.signal));if(this.disposed||token!==this.token)return;
   if(snapshot.discussionId!==this.batch.snapshot.discussionId||snapshot.version<this.batch.snapshot.version)throw Error('STALE_SNAPSHOT');
   this.batch=new EventBatch(snapshot);this.adopt(snapshot);this.abort=undefined;this.open();
  }catch{if(!this.disposed&&token===this.token)this.recover();}
 }
 reconnect(){if(this.disposed)return;this.stopConnection();this.failures=0;this.status('recovering');void this.read();}
 close(){this.disposed=true;this.stopConnection();}
}
