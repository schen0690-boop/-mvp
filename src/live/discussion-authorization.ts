import type {DiscussionContext} from '../providers/discussion.js';
import type {DiscussionOperation} from '../providers/discussion-prompt.js';
import {mkdirSync,existsSync,readdirSync,openSync,writeFileSync,readFileSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {validateUuid,isObject} from '../domain/input.js';
import {ProviderError} from '../providers/roster.js';
import {CallBudgetError} from '../providers/discussion.js';
import type {DiscussionMetric} from '../providers/deepseek-discussion.js';
import {stage6bSettings} from './stage6b-settings.js';
export interface DiscussionBinding {authorizationId:string;discussionId:string;runId:string;generationId:string;lineupRevision:number}
export function writeOnce(path:string,value:unknown){const fd=openSync(path,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}}
export class DiscussionAuthorization {
 constructor(readonly directory:string,readonly binding:DiscussionBinding){
  for(const id of [binding.authorizationId,binding.discussionId,binding.runId,binding.generationId])validateUuid(id);if(binding.lineupRevision!==1)throw new ProviderError('configuration');
  mkdirSync(directory,{recursive:true});const manifest=join(directory,'manifest.json'),expected={authorizationId:binding.authorizationId,discussionId:binding.discussionId,runId:binding.runId,generationId:binding.generationId,lineupRevision:binding.lineupRevision,settings:stage6bSettings};
  if(!existsSync(manifest)){if(readdirSync(directory).length)throw new ProviderError('configuration');writeOnce(manifest,expected);}
  if(JSON.stringify(JSON.parse(readFileSync(manifest,'utf8')))!==JSON.stringify(expected))throw new ProviderError('configuration');
 }
 get started(){return existsSync(join(this.directory,'started.json'));}
 claim():void{if(this.closed||this.started||this.counts.total)throw new ProviderError('configuration');writeOnce(join(this.directory,'started.json'),{runId:this.binding.runId,startedAt:new Date().toISOString()});}
 private slots(){return [...Array.from({length:18},(_,i)=>`ordinary-${i+1}`),...['summary-1','summary-2']].filter(s=>existsSync(join(this.directory,s+'.json')));}
 reserve(operation:DiscussionOperation,discussionId:string,c:DiscussionContext):string{
  if(this.closed||!this.started||discussionId!==this.binding.discussionId||c.runId!==this.binding.runId||c.signal.aborted||performance.now()>=c.deadline||![1,2].includes(c.attemptNo)||!['assessIntent','generateUtterance','extractSynthesis','summarize'].includes(operation))throw new ProviderError('configuration');
  validateUuid(c.taskId);const records=this.slots().map(s=>{const r:unknown=JSON.parse(readFileSync(join(this.directory,s+'.json'),'utf8'));if(!isObject(r)||typeof r.taskId!=='string'||typeof r.operation!=='string'||![1,2].includes(Number(r.attempt)))throw new ProviderError('configuration');return r;});
  const task=records.filter(r=>r.taskId===c.taskId);
  if(task.some(r=>r.operation!==operation||r.attempt===c.attemptNo)||task.length>=2||c.attemptNo===2&&!task.some(r=>r.attempt===1))throw new ProviderError('configuration');
  if(operation==='summarize'&&records.some(r=>r.operation==='summarize'&&r.taskId!==c.taskId))throw new ProviderError('configuration');
  const group=operation==='summarize'?'summary':'ordinary',max=group==='summary'?2:18;
  for(let i=1;i<=max;i++){const slot=`${group}-${i}`,file=join(this.directory,slot+'.json');if(existsSync(file))continue;
   try{writeOnce(file,{discussionId,runId:c.runId,taskId:c.taskId,attempt:c.attemptNo,operation,reservedAt:new Date().toISOString(),requestedModel:'deepseek-flash'});return slot;}catch{throw new ProviderError('configuration');}
  }
  throw new CallBudgetError();
 }
 invoked(slot:string):void{this.assertSlot(slot);writeOnce(join(this.directory,slot+'-invoked.json'),{invokedAt:new Date().toISOString()});}
 record(slot:string,metric:DiscussionMetric):void{this.assertSlot(slot);try{writeOnce(join(this.directory,slot+'-result.json'),metric);}catch{this.close('audit_failure');throw new ProviderError('configuration');}}
 private assertSlot(slot:string){if(!/^(ordinary-([1-9]|1[0-8])|summary-[12])$/.test(slot)||!existsSync(join(this.directory,slot+'.json')))throw new ProviderError('configuration');}
 close(reason:string):void{if(this.closed)return;writeOnce(join(this.directory,'closed.json'),{reason:['terminal','shutdown','interrupted','audit_failure','fatal'].includes(reason)?reason:'shutdown',closedAt:new Date().toISOString()});}
 get counts(){const slots=this.slots(),ordinary=slots.filter(s=>s.startsWith('ordinary')).length,summary=slots.length-ordinary;return {ordinary,summary,total:slots.length};}
 get closed(){return existsSync(join(this.directory,'closed.json'));}
}
