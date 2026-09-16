import type {DraftSnapshot} from '../../src/domain/drafts.js';
import {decodeSnapshot} from '../../web/src/api.js';
import {setTimeout as delay} from 'node:timers/promises';
export interface Binding {discussionId:string;generationId:string;lineupRevision:number}
export interface ReadyOptions {timeoutMs?:number;requestTimeoutMs?:number;intervalMs?:number;maxAttempts?:number;transport?:typeof fetch}
export class ReadinessError extends Error {
 readonly code:string; readonly status:number|undefined;
 constructor(code:string,status?:number){super(status===undefined?code:`${code}: HTTP ${status}`);this.name='ReadinessError';this.code=code;this.status=status;}
}
function connectionFailure(error:unknown):boolean{
 return error instanceof TypeError && error.cause instanceof Error && 'code' in error.cause &&
  ['ECONNREFUSED','ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(String(error.cause.code));
}
/** Native Fetch only. Check the existing GET discussion DTO, not a made-up /health. */
export async function waitForSnapshot(url:string,binding:Binding,options:ReadyOptions={}):Promise<DraftSnapshot>{
 const endpoint=new URL(url);if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1')throw new ReadinessError('NON_LOCAL_READINESS_URL');
 const {timeoutMs=15000,requestTimeoutMs=1500,intervalMs=100,maxAttempts=100,transport=fetch}=options;
 if([timeoutMs,requestTimeoutMs,intervalMs,maxAttempts].some(n=>!Number.isSafeInteger(n)||n<=0))throw new ReadinessError('INVALID_READINESS_LIMIT');
 const end=performance.now()+timeoutMs;let last=new ReadinessError('SERVICE_UNREACHABLE');
 for(let attempt=0;attempt<maxAttempts&&performance.now()<end;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(requestTimeoutMs,end-performance.now())));
  let response:Response|undefined,body:unknown;
  try{
   // Only expected transport failures are retried. Type/programming errors escape unchanged.
   try{response=await transport(url,{signal:controller.signal,redirect:'error'});if(response.ok){if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new ReadinessError('INVALID_SNAPSHOT');}body=await response.json();}}
   catch(error){
    if(controller.signal.aborted&&(error instanceof Error)&&(error.name==='AbortError'||error.name==='TimeoutError'))last=new ReadinessError('REQUEST_TIMEOUT');
    else if(connectionFailure(error))last=new ReadinessError('SERVICE_UNREACHABLE');
    else if(error instanceof SyntaxError)throw new ReadinessError('INVALID_SNAPSHOT');
    else throw error;
   }
   if(response&&!controller.signal.aborted){
    if(!response.ok){await response.body?.cancel();last=new ReadinessError('HTTP_NOT_READY',response.status);if(response.status!==503)throw last;}
    else{
     let snapshot:DraftSnapshot;
     try{snapshot=decodeSnapshot(body);}catch(error){if(error instanceof Error&&error.message==='返回的数据不符合约定，请重新加载')throw new ReadinessError('INVALID_SNAPSHOT');throw error;}
     if(snapshot.discussionId!==binding.discussionId||snapshot.status!=='lineup_confirmed'||snapshot.lineupGeneration?.generationId!==binding.generationId||snapshot.confirmedLineupRevision!==binding.lineupRevision)throw new ReadinessError('INVALID_SNAPSHOT');
     return snapshot;
    }
   }
  }finally{clearTimeout(timer);}
  const remaining=end-performance.now();if(attempt+1<maxAttempts&&remaining>0)await delay(Math.min(intervalMs,remaining));
 }
 throw last;
}
/** Scope is explicit closures over children created by this invocation; no port/PID discovery. */
export function cleanupOnce(actions:ReadonlyArray<()=>Promise<void>>):()=>Promise<void>{
 let completion:Promise<void>|undefined;
 return ()=>completion??= (async()=>{const errors:unknown[]=[];for(const action of actions){try{await action();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'OWNED_RESOURCE_CLEANUP_FAILED');})();
}

/** Read-only settlement after browser exit; never issues a start/stop or model operation. */
export async function waitForRunTerminal(url:string,runId:string,options:ReadyOptions={}):Promise<DraftSnapshot>{
 const endpoint=new URL(url);if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1')throw new ReadinessError('NON_LOCAL_READINESS_URL');
 const end=performance.now()+(options.timeoutMs??190000),transport=options.transport??fetch;
 while(performance.now()<end){
  const response=await transport(url,{signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(options.requestTimeoutMs??1500,end-performance.now())))),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw new ReadinessError('HTTP_NOT_READY',response.status);}
  const snapshot=decodeSnapshot(await response.json());
  if(snapshot.status==='lineup_confirmed')return snapshot; // Start may never have been accepted; do not send it again.
  if(snapshot.runtime?.runId!==runId)throw Error('UNEXPECTED_RUN');
  if(snapshot.status==='completed'||snapshot.status==='failed')return snapshot;
  await delay(Math.max(1,Math.min(options.intervalMs??500,end-performance.now())));
 }
 throw new ReadinessError('RUN_RESULT_UNVERIFIED');
}
