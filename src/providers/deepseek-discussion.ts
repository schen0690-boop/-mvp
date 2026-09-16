import type {DiscussionProvider} from './discussion.js';
import type {DeepSeekConfig} from './config.js';
import type {DiscussionContext} from './discussion.js';
import type {DiscussionInput} from '../domain/discussion.js';
import {DiscussionValidationError,parseIntent,parseUtterance,parseSynthesis,parseSummary} from '../domain/discussion.js';
import {requestCompletion,type RequestMetric} from './deepseek-transport.js';
import {discussionMessages,discussionTokenLimits,type DiscussionOperation} from './discussion-prompt.js';
export interface DiscussionMetric {operation:DiscussionOperation;taskId:string;attempt:number;elapsedMs:number;httpStatus?:number;finishReason?:string;usage:Record<string,number>|'未取得';outcome:string}
export class DeepSeekDiscussionProvider implements DiscussionProvider {
 constructor(private readonly config:DeepSeekConfig,private readonly transport:typeof fetch,private readonly record:(metric:DiscussionMetric)=>void=()=>{}){}
 private async call<T>(operation:DiscussionOperation,input:DiscussionInput,context:DiscussionContext,parse:(raw:unknown)=>T):Promise<T>{
  const messages=discussionMessages(operation,input,context);let metric:RequestMetric|undefined;
  try{
   const content=await requestCompletion({...this.config,maxTokens:discussionTokenLimits[operation]},this.transport,messages,context,()=>new DiscussionValidationError('invalid_structure'),m=>{metric=m;});
   if(Buffer.byteLength(content)>16384)throw new DiscussionValidationError('invalid_structure');
   let raw:unknown;try{raw=JSON.parse(content);}catch{throw new DiscussionValidationError('invalid_structure');}
   return parse(raw);
  }catch(error){if(metric&&error instanceof DiscussionValidationError)metric.outcome=error.kind;throw error;}
  finally{if(metric){const safe:DiscussionMetric={operation,taskId:context.taskId,attempt:context.attemptNo,elapsedMs:metric.elapsedMs,usage:metric.usage??'未取得',outcome:metric.outcome};if(metric.httpStatus!==undefined)safe.httpStatus=metric.httpStatus;if(metric.finishReason)safe.finishReason=metric.finishReason;try{this.record(safe);}catch{/* Diagnostics cannot change the result. */}}}
 }
 assessIntent:DiscussionProvider['assessIntent']=async(i,c)=>this.call('assessIntent',i,c,raw=>parseIntent(raw,i));
 generateUtterance:DiscussionProvider['generateUtterance']=async(i,c)=>this.call('generateUtterance',i,c,raw=>parseUtterance(raw,i,i.purpose));
 extractSynthesis:DiscussionProvider['extractSynthesis']=async(i,c)=>this.call('extractSynthesis',i,c,raw=>({items:parseSynthesis(raw,i)}));
 summarize:DiscussionProvider['summarize']=async(i,c)=>this.call('summarize',i,c,raw=>({text:parseSummary(raw)}));
}
