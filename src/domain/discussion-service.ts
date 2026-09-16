import {randomUUID} from 'node:crypto';
import type {DiscussionStore,StartResult,RunState,RunKey} from './discussion-store.js';
import type {DiscussionProvider,DiscussionContext} from '../providers/discussion.js';
import type {DiscussionSnapshot} from './snapshot.js';
import type {LineupMember} from './lineup.js';
import {exactKeys,validateConfirm} from './lineup.js';
import {isObject,validateUuid} from './input.js';
import {AppError,invalidInput} from './errors.js';
import {CallLimiter} from '../providers/call-limiter.js';
import {ProviderError} from '../providers/roster.js';
import {DiscussionValidationError,parseIntent,parseUtterance,parseSynthesis,parseSummary,rankCandidates,type Candidate,type DiscussionInput,type Purpose,type Intent,type StopReason} from './discussion.js';
interface Runner {ordinary:AbortController;summary:AbortController;done:Promise<void>;timer:ReturnType<typeof setTimeout>;runId:string}
class ControlError extends Error {constructor(readonly kind:'stale'|'budget'){super(kind);}}
export class DiscussionService {
 private readonly runners=new Map<string,Runner>();
 private readonly unavailable=new Set<string>();
 private closing=false;
 constructor(private readonly store:DiscussionStore,private readonly provider:DiscussionProvider,private readonly limiter=new CallLimiter(),private readonly options:{schedule?:(task:()=>void)=>void}={}){}
 private storage<T>(fn:()=>T):T{try{return fn();}catch(e){if(e instanceof AppError)throw e;throw new AppError('STORAGE_UNAVAILABLE','讨论存储暂时不可用',503);}}
 assertAvailable(id?:string):void{if(id?this.unavailable.has(id):this.unavailable.size>0)throw new AppError('STORAGE_UNAVAILABLE','讨论存储暂时不可用',503);}
 private state(id:string):RunState{const s=this.storage(()=>this.store.state(id));if(!s)throw new AppError('NOT_FOUND','未找到讨论',404);return s;}
 start(id:unknown,body:unknown):StartResult{
  const discussionId=validateUuid(id);
  if(!isObject(body)||!exactKeys(body,['requestId','generationId','lineupRevision']))invalidInput();
  const input={requestId:validateUuid(body.requestId),...validateConfirm({generationId:body.generationId,lineupRevision:body.lineupRevision})};
  this.assertAvailable(discussionId);if(this.closing)throw new AppError('STORAGE_UNAVAILABLE','服务正在关闭',503);
  const result=this.storage(()=>this.store.begin(discussionId,input));if(result.replayed)return result;
  let resolveDone!:()=>void;const done=new Promise<void>(resolve=>{resolveDone=resolve;});
  const entry:Runner={ordinary:new AbortController(),summary:new AbortController(),done,runId:result.runId,timer:setTimeout(()=>{
   try{if(this.state(discussionId).snapshot.status==='running')this.requestStop(discussionId,'duration_limit');}catch{this.fail(discussionId,'RUNTIME_STORAGE_FAILED');}
  },600000)};
  // No await before registration: POST is the sole runner creation path.
  this.runners.set(discussionId,entry);
  const complete=()=>{clearTimeout(entry.timer);entry.ordinary.abort();entry.summary.abort();this.runners.delete(discussionId);resolveDone();};
  try{(this.options.schedule??queueMicrotask)(()=>{void this.run(discussionId,entry).catch(()=>this.fail(discussionId,'RUNTIME_STORAGE_FAILED')).finally(complete);});}
  catch{this.fail(discussionId,'RUN_START_FAILED');complete();}
  return result;
 }
 stop(id:unknown,body:unknown):DiscussionSnapshot{
  const discussionId=validateUuid(id);if(!isObject(body)||!exactKeys(body,[]))invalidInput();this.assertAvailable(discussionId);return this.requestStop(discussionId,'user_requested');
 }
 private requestStop(id:string,reason:StopReason):DiscussionSnapshot{
  const s=this.storage(()=>this.store.stop(id,reason));this.runners.get(id)?.ordinary.abort();return s;
 }
 private fail(id:string,code:string):void{
  this.runners.get(id)?.ordinary.abort();this.runners.get(id)?.summary.abort();
  try{this.store.fail(id,code);}catch{this.unavailable.add(id);}
 }
 private input(st:RunState):DiscussionInput{
  const s=st.snapshot;const input={discussionId:s.discussionId,topic:s.topic,roles:s.roles,utterances:s.utterances,synthesis:s.synthesis,sourceTranscriptVersion:s.transcriptVersion};
  if(Buffer.byteLength(JSON.stringify(input))>98304)throw new Error('CONTEXT_LIMIT');return input;
 }
 private valid(key:RunKey,summary:boolean):boolean{
  const st=this.state(key.discussionId);return st.key.runId===key.runId&&st.key.epoch===key.epoch&&st.key.sourceTranscriptVersion===key.sourceTranscriptVersion&&st.snapshot.status===(summary?'stopping':'running');
 }
 private async call<T>(entry:Runner,st:RunState,operation:(ctx:DiscussionContext)=>Promise<unknown>,parse:(raw:unknown)=>T,roleId?:string,summary=false,window=Infinity):Promise<T>{
  const signal=summary?entry.summary.signal:entry.ordinary.signal,key=st.key;
  const date=summary?st.snapshot.runtime?.stopDeadlineAt:st.snapshot.runtime?.runDeadlineAt;
  const deadline=Math.min(window,performance.now()+60000,performance.now()+Math.max(0,Date.parse(date??'')-Date.now()));
  let issues:{path:string;rule:string}[]|undefined;
  const taskId=randomUUID();
  for(let attemptNo=1;attemptNo<=2;attemptNo++){
   const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   try{
    const raw=await this.limiter.run(key.discussionId,controller.signal,deadline,async()=>{
     if(controller.signal.aborted||!this.valid(key,summary))throw new ControlError('stale');
     if(!this.storage(()=>this.store.reserve(key,summary)))throw new ControlError('budget');
     if(roleId&&!summary)this.storage(()=>this.store.role(key,roleId,'preparing'));
     const callDeadline=Math.min(deadline,performance.now()+30000);
     return new Promise<unknown>((resolve,reject)=>{
      let settled=false;
      const finish=(ok:boolean,value:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);if(ok)resolve(value);else reject(value);};
      const cancel=()=>finish(false,new ProviderError('cancelled'));
      const timer=setTimeout(()=>{const error=new ProviderError('timeout');finish(false,error);controller.abort(error);},Math.max(0,callDeadline-performance.now()));
      controller.signal.addEventListener('abort',cancel,{once:true});
      if(controller.signal.aborted){cancel();return;}
      const context:DiscussionContext={signal:controller.signal,deadline:callDeadline,runId:key.runId,epoch:key.epoch,taskId,attemptNo,sourceTranscriptVersion:key.sourceTranscriptVersion,...(issues?{repairIssues:issues}:{})};
      try{void operation(context).then(v=>finish(true,v),e=>finish(false,e));}catch(e){finish(false,e);}
     });
    });
    if(signal.aborted||performance.now()>=deadline||!this.valid(key,summary))throw new ControlError('stale');
    return parse(raw);
   }catch(e){
    if(e instanceof AppError||e instanceof ControlError||signal.aborted||attemptNo===2||performance.now()>=deadline||e instanceof ProviderError&&!e.retryable||e instanceof Error&&e.message==='local_capacity')throw e;
    issues=e instanceof DiscussionValidationError?[{path:'result',rule:e.kind}]:undefined;
   }finally{
    signal.removeEventListener('abort',abort);controller.abort();
    if(roleId&&!summary&&this.valid(key,false))this.storage(()=>this.store.role(key,roleId,'idle'));
   }
  }
  throw new Error('ATTEMPTS_EXHAUSTED');
 }
 private fatal(error:unknown):void{
  if(error instanceof AppError||error instanceof ControlError||error instanceof ProviderError&&error.kind==='configuration'||error instanceof Error&&['HOST_UNAVAILABLE','CONTEXT_LIMIT'].includes(error.message))throw error;
 }
 private async speak(id:string,entry:Runner,member:LineupMember,purpose:Purpose,intent:Intent|null=null):Promise<boolean>{
  const st=this.state(id),input=this.input(st);
  const speech=await this.call(entry,st,c=>this.provider.generateUtterance({...input,member,purpose,intent},c),raw=>parseUtterance(raw,input,purpose),member.memberId);
  return this.storage(()=>this.store.append(st.key,member.memberId,speech));
 }
 private async run(id:string,entry:Runner):Promise<void>{
  let hostInterventions=0,emptyRound=false,synthesisFailures=0;
  const waiting=new Map<string,number>();
  try{
   let st=this.state(id),host=st.snapshot.roles.find(m=>m.role==='moderator');if(!host)throw new Error('HOST_UNAVAILABLE');
   if(st.snapshot.status==='running'){
    try{await this.speak(id,entry,host,'opening');}catch(e){this.fatal(e);if(entry.ordinary.signal.aborted)throw e;throw new Error('HOST_UNAVAILABLE');}
   }
   while((st=this.state(id)).snapshot.status==='running'&&!entry.ordinary.signal.aborted){
    if(Date.now()>=Date.parse(st.snapshot.runtime!.runDeadlineAt)){this.requestStop(id,'duration_limit');break;}
    if(st.callsUsed>=st.callLimit-2){this.requestStop(id,'call_budget_exhausted');break;}
    for(const role of st.snapshot.roleStates??[])if(role.status==='speaking')this.storage(()=>this.store.role(st.key,role.roleId,'idle'));
    const input=this.input(st),window=performance.now()+60000;
    const responses=await Promise.all(st.snapshot.roles.filter(m=>m.role==='expert').map(async member=>{
     try{
      const intent=await this.call(entry,st,c=>this.provider.assessIntent({...input,member},c),raw=>parseIntent(raw,input),member.memberId,false,window);
      this.storage(()=>this.store.role(st.key,member.memberId,'idle',intent.publicFocus));return {member,intent};
     }catch(error){return {error};}
    }));
    for(const response of responses)if('error' in response)this.fatal(response.error);
    if(entry.ordinary.signal.aborted||!this.valid(st.key,false))break;
    const candidates:Candidate[]=responses.flatMap(r=>r.member&&r.intent?[{member:r.member,intent:r.intent}]:[]);
    const ordered=rankCandidates(candidates,input,waiting);let winner:Candidate|undefined;
    for(const candidate of ordered){
     try{if(await this.speak(id,entry,candidate.member,'expert',candidate.intent)){winner=candidate;break;}}
     catch(error){this.fatal(error);if(entry.ordinary.signal.aborted)throw error;}
    }
    if(!winner){
     const nobody=ordered.length===0&&candidates.length>0;
     if(emptyRound||hostInterventions>=2){if(nobody)this.requestStop(id,'no_participation');else this.fail(id,'DISCUSSION_PARTICIPATION_UNAVAILABLE');break;}
     hostInterventions++;emptyRound=true;
     try{await this.speak(id,entry,host,'clarify');}catch(error){this.fatal(error);throw new Error('HOST_UNAVAILABLE');}
     continue;
    }
    emptyRound=false;
    // Only successful public commits advance fairness accounting.
    for(const m of st.snapshot.roles.filter(m=>m.role==='expert')){
     const applies=candidates.some(c=>c.member.memberId===m.memberId&&c.intent.wantsToSpeak);
     waiting.set(m.memberId,m.memberId===winner.member.memberId||!applies?0:(waiting.get(m.memberId)??0)+1);
    }
    st=this.state(id);if(st.snapshot.status!=='running')break;
    const synthesisInput=this.input(st);this.storage(()=>this.store.synthesisStatus(st.key,'preparing'));
    try{
     const items=await this.call(entry,st,c=>this.provider.extractSynthesis(synthesisInput,c),raw=>parseSynthesis(raw,synthesisInput));
     if(this.storage(()=>this.store.synthesize(st.key,items)))synthesisFailures=0;
     if(hostInterventions<2&&items.some(item=>item.kind==='disagreement'&&item.evidenceUtteranceIds.includes(st.snapshot.utterances.at(-1)!.id))&&this.state(id).snapshot.status==='running'){
      hostInterventions++;try{await this.speak(id,entry,host,'bridge');}catch(error){this.fatal(error);throw new Error('HOST_UNAVAILABLE');}
     }
    }catch(error){
     this.fatal(error);if(entry.ordinary.signal.aborted)throw error;
     this.storage(()=>this.store.synthesisStatus(st.key,'failed'));synthesisFailures++;
     if(synthesisFailures>=2)this.requestStop(id,'synthesis_unavailable');
    }
   }
  }catch(error){
   const current=this.state(id).snapshot.status;
   if(current==='running'){
    if(error instanceof ControlError&&error.kind==='budget')this.requestStop(id,'call_budget_exhausted');
    else if(entry.ordinary.signal.aborted||error instanceof ControlError&&Date.now()>=Date.parse(this.state(id).snapshot.runtime!.runDeadlineAt))this.requestStop(id,'duration_limit');
    else this.fail(id,error instanceof ProviderError&&error.kind==='configuration'?'DISCUSSION_PROVIDER_CONFIGURATION':error instanceof Error&&error.message==='CONTEXT_LIMIT'?'CONTEXT_LIMIT':error instanceof Error&&error.message==='HOST_UNAVAILABLE'?'HOST_UNAVAILABLE':'RUNTIME_STORAGE_FAILED');
   }
  }
  entry.ordinary.abort();
  const st=this.state(id);if(st.snapshot.status!=='stopping'||this.closing)return;
  if(!st.snapshot.utterances.length){this.storage(()=>this.store.finish(st.key,null));return;}
  const input=this.input(st),member=st.snapshot.roles[0]!;
  try{
   const summary=await this.call(entry,st,c=>this.provider.summarize({...input,member,stopReason:st.snapshot.stopReason!},c),parseSummary,undefined,true);
   if(!this.storage(()=>this.store.finish(st.key,summary)))this.storage(()=>this.store.finish(st.key,null));
  }catch(error){
   if(error instanceof AppError)throw error;
   if(error instanceof ProviderError&&error.kind==='configuration'){this.fail(id,'DISCUSSION_PROVIDER_CONFIGURATION');return;}
   this.storage(()=>this.store.finish(st.key,null));
  }
 }
 async idle():Promise<void>{await Promise.all([...this.runners.values()].map(r=>r.done));}
 async close():Promise<void>{
  this.closing=true;for(const [id,entry] of this.runners){this.fail(id,'RUN_INTERRUPTED');entry.ordinary.abort();entry.summary.abort();}await this.idle();
 }
 recover():void{if(this.runners.size)throw new AppError('INVALID_STATE','运行中不能恢复',409);this.storage(()=>this.store.recover());this.unavailable.clear();}
}
