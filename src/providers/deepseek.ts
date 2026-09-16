import type { DeepSeekConfig } from './config.js';
import type { RosterContext,RosterGenerator,RosterInput } from './roster.js';
import { ProviderError } from './roster.js';
import { readRosterConfig } from './config.js';
import { RosterValidationError } from '../domain/lineup.js';
import { isObject } from '../domain/input.js';
import { rosterMessages } from './roster-prompt.js';
export interface RequestMetric { elapsedMs:number; attempt?:number; httpStatus?:number; finishReason?:string; requestId?:string; responseModel?:string; usage?:Record<string,number>; outcome:string }
export class DeepSeekRosterProvider implements RosterGenerator {
  constructor(private readonly config:DeepSeekConfig,private readonly transport:typeof fetch,private readonly record:(metric:RequestMetric)=>void=()=>{}){}
  async generateRoster(input:RosterInput,context:RosterContext):Promise<string>{
    readRosterConfig({ROSTER_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:this.config.baseUrl,DEEPSEEK_MODEL:this.config.model,DEEPSEEK_API_KEY:this.config.apiKey,DEEPSEEK_MAX_TOKENS:String(this.config.maxTokens)});
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
      const response=await this.transport(`${this.config.baseUrl}/chat/completions`,{
        method:'POST',redirect:'error',headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({model:this.config.model,messages:rosterMessages(input,context),thinking:{type:'disabled'},stream:false,response_format:{type:'json_object'},max_tokens:this.config.maxTokens})
      });
      metric.httpStatus=response.status;
      if(response.status!==200){await response.body?.cancel();throw new ProviderError([429,500,503,502,504,408].includes(response.status)?'transport':'configuration');}
      const reader=response.body?.getReader();if(!reader)throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');
      let text='',bytes=0;const decoder=new TextDecoder();
      try {
        while(true){controller.signal.throwIfAborted();const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
          if(bytes>131072)throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');text+=decoder.decode(part.value,{stream:true});}
        text+=decoder.decode();
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      controller.signal.throwIfAborted();
      let outer:unknown;try{outer=JSON.parse(text);}catch{throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');}
      if(!isObject(outer)||!Array.isArray(outer.choices)||outer.choices.length!==1)throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');
      const safe=(value:unknown,pattern:RegExp)=>typeof value==='string'&&pattern.test(value)&&!value.includes(this.config.apiKey)?value:undefined;
      const model=safe(outer.model,/^deepseek-[a-zA-Z0-9.-]{1,64}$/),id=safe(outer.id,/^[a-zA-Z0-9_-]{1,128}$/);
      if(model)metric.responseModel=model;if(id)metric.requestId=id;
      if(isObject(outer.usage)){
        const usage:Record<string,number>={};for(const key of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']){
          const v=outer.usage[key];if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)usage[key]=v;}
        if(Object.keys(usage).length)metric.usage=usage;
      }
      const choice:unknown=outer.choices[0];
      if(!isObject(choice)||choice.index!==0||!isObject(choice.message)||choice.message.role!=='assistant')throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');
      const finish=choice.finish_reason;
      if(typeof finish==='string'&&['stop','length','content_filter','tool_calls','insufficient_system_resource','aborted'].includes(finish))metric.finishReason=finish;
      const message=choice.message;
      if(finish==='content_filter'||finish==='tool_calls'||message.tool_calls!=null||message.function_call!=null)throw new ProviderError('filtered');
      if(finish==='aborted')throw new ProviderError('cancelled');
      if(finish!=='stop'||typeof message.content!=='string'||!message.content.trim())throw new RosterValidationError('LINEUP_INVALID_STRUCTURE');
      metric.outcome='content_received';return message.content;
    } catch(error){
      const safeError=controller.signal.aborted?new ProviderError(context.signal.aborted?abortKind():'timeout'):
        error instanceof ProviderError||error instanceof RosterValidationError?error:new ProviderError('transport');
      metric.outcome=safeError instanceof ProviderError?safeError.kind:safeError.code;throw safeError;
    } finally {
      clearTimeout(timer);context.signal.removeEventListener('abort',abort);controller.abort();metric.elapsedMs=Math.round(performance.now()-started);
      try{this.record(metric);}catch{/* Diagnostics cannot alter a model result. */}
    }
  }
}
