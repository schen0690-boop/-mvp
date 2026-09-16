import type {DeepSeekConfig} from './config.js';
import {readRosterConfig} from './config.js';
import {ProviderError} from './roster.js';
import {isObject} from '../domain/input.js';
export interface RequestMetric {elapsedMs:number;attempt?:number;httpStatus?:number;finishReason?:string;requestId?:string;responseModel?:string;usage?:Record<string,number>;outcome:string}
export interface CompletionContext {signal:AbortSignal;deadline:number;acceptanceAttempt?:number}
export interface ChatMessage {role:'system'|'user';content:string}
export async function requestCompletion(config:DeepSeekConfig,transport:typeof fetch,messages:ChatMessage[],context:CompletionContext,makeInvalid:()=>Error,record:(metric:RequestMetric)=>void=()=>{}):Promise<string>{
 readRosterConfig({ROSTER_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:config.baseUrl,DEEPSEEK_MODEL:config.model,DEEPSEEK_API_KEY:config.apiKey,DEEPSEEK_MAX_TOKENS:'4096'});
 if(!Number.isSafeInteger(config.maxTokens)||config.maxTokens<1||config.maxTokens>4096)throw new ProviderError('configuration');
 let validationError:Error|undefined;const invalid=()=>{validationError=makeInvalid();return validationError;};
    const abortKind=()=>context.signal.reason instanceof ProviderError&&context.signal.reason.kind==='timeout'?'timeout':'cancelled';
    if(context.signal.aborted)throw new ProviderError(abortKind());
    const remaining=Math.min(30000,context.deadline-performance.now());
    if(remaining<=0)throw new ProviderError('timeout');
    const started=performance.now(),controller=new AbortController();
    const abort=()=>controller.abort();context.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,remaining);
    const metric:RequestMetric={elapsedMs:0,outcome:'transport'};
    if(context.acceptanceAttempt===1||context.acceptanceAttempt===2)metric.attempt=context.acceptanceAttempt;
    try {
      const response=await transport(`${config.baseUrl}/chat/completions`,{
        method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({model:config.model,messages:messages,thinking:{type:'disabled'},stream:false,response_format:{type:'json_object'},max_tokens:config.maxTokens})
      });
      metric.httpStatus=response.status;
      if(response.status!==200){await response.body?.cancel();throw new ProviderError([429,500,503,502,504,408].includes(response.status)?'transport':'configuration');}
      const reader=response.body?.getReader();if(!reader)throw invalid();
      let text='',bytes=0;const decoder=new TextDecoder();
      try {
        while(true){controller.signal.throwIfAborted();const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
          if(bytes>131072)throw invalid();text+=decoder.decode(part.value,{stream:true});}
        text+=decoder.decode();
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      controller.signal.throwIfAborted();
      let outer:unknown;try{outer=JSON.parse(text);}catch{throw invalid();}
      if(!isObject(outer)||!Array.isArray(outer.choices)||outer.choices.length!==1)throw invalid();
      const safe=(value:unknown,pattern:RegExp)=>typeof value==='string'&&pattern.test(value)&&!value.includes(config.apiKey)?value:undefined;
      const model=safe(outer.model,/^deepseek-[a-zA-Z0-9.-]{1,64}$/),id=safe(outer.id,/^[a-zA-Z0-9_-]{1,128}$/);
      if(model)metric.responseModel=model;if(id)metric.requestId=id;
      if(isObject(outer.usage)){
        const usage:Record<string,number>={};for(const key of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']){
          const v=outer.usage[key];if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)usage[key]=v;}
        if(Object.keys(usage).length)metric.usage=usage;
      }
      const choice:unknown=outer.choices[0];
      if(!isObject(choice)||choice.index!==0||!isObject(choice.message)||choice.message.role!=='assistant')throw invalid();
      const finish=choice.finish_reason;
      if(typeof finish==='string'&&['stop','length','content_filter','tool_calls','insufficient_system_resource','aborted'].includes(finish))metric.finishReason=finish;
      const message=choice.message;
      if(finish==='content_filter'||finish==='tool_calls'||message.tool_calls!=null||message.function_call!=null)throw new ProviderError('filtered');
      if(finish==='aborted')throw new ProviderError('cancelled');
      if(finish!=='stop'||typeof message.content!=='string'||!message.content.trim())throw invalid();
      metric.outcome='content_received';return message.content;
    } catch(error){
      const safeError=controller.signal.aborted?new ProviderError(context.signal.aborted?abortKind():'timeout'):
        error instanceof ProviderError||(error instanceof Error&&error===validationError)?error:new ProviderError('transport');
      metric.outcome=safeError instanceof ProviderError?safeError.kind:safeError.message;throw safeError;
    } finally {
      clearTimeout(timer);context.signal.removeEventListener('abort',abort);controller.abort();metric.elapsedMs=Math.round(performance.now()-started);
      try{record(metric);}catch{/* Diagnostics cannot alter a model result. */}
    }
}
