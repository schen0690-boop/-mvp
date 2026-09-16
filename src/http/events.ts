import type {Request,Response} from 'express';
import {validateUuid} from '../domain/input.js';
import {invalidInput} from '../domain/errors.js';
import type {SqliteEventSource,ResetReason} from '../db/public-events.js';
export const streamLimits={heartbeatMs:15000,drainMs:10000,maxEvents:64,maxBytes:256*1024};
export function serveEvents(req:Request,res:Response,source:SqliteEventSource):void{
 const id=validateUuid(req.params.discussionId);
 if(Object.keys(req.query).some(k=>k!=='after'))invalidInput('订阅参数不符合要求');
 const parse=(v:unknown)=>{if(typeof v!=='string'||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))invalidInput('订阅游标不符合要求');return Number(v);};
 let cursor=req.query.after===undefined?0:parse(req.query.after);
 const header=req.get('Last-Event-ID');if(header!==undefined){const parts=header.split(':');if(parts.length!==2||parts[0]!==id)invalidInput('订阅游标不符合要求');cursor=parse(parts[1]);}
 let closed=false,scheduled=false,blocked=false;let heartbeat:ReturnType<typeof setInterval>|undefined,drainTimer:ReturnType<typeof setTimeout>|undefined;
 const queue:string[]=[];let bytes=0;
 const cleanup=()=>{if(closed)return;closed=true;unsubscribe();clearInterval(heartbeat);clearTimeout(drainTimer);queue.length=0;bytes=0;res.off('drain',drain);res.off('close',cleanup);res.off('error',end);};
 const end=()=>{cleanup();res.end();};
 const reset=(reason:ResetReason)=>{if(!blocked)res.write(`event: stream.reset\ndata: ${JSON.stringify({reason,snapshotPath:`/api/discussions/${id}`})}\n\n`);end();};
 const wake=()=>{if(closed||scheduled||blocked)return;scheduled=true;queueMicrotask(()=>{scheduled=false;pump();});};
 const unsubscribe=source.subscribe(wake);
 const drain=()=>{blocked=false;clearTimeout(drainTimer);wake();};
 const write=(value:string)=>{if(res.write(value))return true;blocked=true;drainTimer=setTimeout(end,streamLimits.drainMs);return false;};
 function pump(){
  if(closed||blocked)return;
  try{
   while(queue.length){const next=queue.shift()!;bytes-=Buffer.byteLength(next);if(!write(next))return;}
   const page=source.read(id,cursor);if(page.reset){reset(page.reset);return;}
   for(const e of page.events){const frame=`id: ${id}:${e.eventId}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;bytes+=Buffer.byteLength(frame);queue.push(frame);}
   if(queue.length>streamLimits.maxEvents||bytes>streamLimits.maxBytes){end();return;}
   if(page.events.length){cursor=page.events.at(-1)!.eventId;wake();return;}
   if(['completed','failed'].includes(page.status)){write(`event: stream.end\ndata: ${JSON.stringify({discussionId:id,lastEventId:cursor})}\n\n`);end();}
  }catch{reset('history_unavailable');}
 }
 try{
  const first=source.read(id,cursor);
  if(!first.reset&&cursor===first.highWater&&['completed','failed'].includes(first.status)){cleanup();res.status(204).end();return;}
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no','Connection':'keep-alive'});res.flushHeaders();
  res.on('close',cleanup);res.on('error',end);res.on('drain',drain);
  heartbeat=setInterval(()=>{if(!closed&&!blocked)write(': heartbeat\n\n');},streamLimits.heartbeatMs);
  wake();
 }catch(error){cleanup();throw error;}
}
