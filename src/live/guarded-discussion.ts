import type {DiscussionProvider,DiscussionContext} from '../providers/discussion.js';
import type {DiscussionInput} from '../domain/discussion.js';
import type {RunState} from '../domain/discussion-store.js';
import type {DeepSeekConfig} from '../providers/config.js';
import {DeepSeekDiscussionProvider,type DiscussionMetric} from '../providers/deepseek-discussion.js';
import {ProviderError} from '../providers/roster.js';
import {discussionTokenLimits,type DiscussionOperation} from '../providers/discussion-prompt.js';
import {stage6bSettings} from './stage6b-settings.js';
import type {DiscussionAuthorization} from './discussion-authorization.js';
export class GuardedDiscussionProvider implements DiscussionProvider {
 constructor(private readonly auth:DiscussionAuthorization,private readonly config:DeepSeekConfig,private readonly transport:typeof fetch,private readonly state:()=>RunState|undefined){}
 private async dispatch(operation:DiscussionOperation,input:DiscussionInput,c:DiscussionContext,invoke:(p:DeepSeekDiscussionProvider)=>Promise<unknown>){
  let slot:string|undefined,metric:DiscussionMetric|undefined,blocked:unknown;
  const transport:typeof fetch=async(url,init)=>{
   try{
    const st=this.state(),b=this.auth.binding,summary=operation==='summarize';
    if(!st||this.auth.closed||input.discussionId!==b.discussionId||input.topic!==stage6bSettings.topic||input.roles.length!==3||c.runId!==b.runId||st.key.runId!==c.runId||st.key.epoch!==c.epoch||st.key.sourceTranscriptVersion!==c.sourceTranscriptVersion||st.snapshot.status!==(summary?'stopping':'running')||st.snapshot.lineupGeneration?.generationId!==b.generationId||st.snapshot.confirmedLineupRevision!==b.lineupRevision)throw new ProviderError('configuration');
    if(c.signal.aborted||performance.now()>=c.deadline)throw new ProviderError('cancelled');
    const body=JSON.parse(String(init?.body));
    if(String(url)!=='https://api.deepseek.com/chat/completions'||init?.redirect!=='error'||body.model!=='deepseek-flash'||body.thinking?.type!=='disabled'||body.stream!==false||body.response_format?.type!=='json_object'||body.tools!==undefined||body.max_tokens!==discussionTokenLimits[operation])throw new ProviderError('configuration');
    slot=this.auth.reserve(operation,input.discussionId,c);
   }catch(error){blocked=error;throw error;}
   // Count is durable before invoking fetch; a crash here conservatively consumes the slot.
   const request=this.transport(url,init);try{this.auth.invoked(slot);}catch{void request.catch(()=>{});this.auth.close('audit_failure');throw new ProviderError('configuration');}return request;
  };
  try{return await invoke(new DeepSeekDiscussionProvider(this.config,transport,m=>{metric=m;}));}
  catch(error){if(blocked)throw blocked;throw error;}
  finally{if(slot&&metric)this.auth.record(slot,metric);}
 }
 assessIntent:DiscussionProvider['assessIntent']=(i,c)=>this.dispatch('assessIntent',i,c,p=>p.assessIntent(i,c));
 generateUtterance:DiscussionProvider['generateUtterance']=(i,c)=>this.dispatch('generateUtterance',i,c,p=>p.generateUtterance(i,c));
 extractSynthesis:DiscussionProvider['extractSynthesis']=(i,c)=>this.dispatch('extractSynthesis',i,c,p=>p.extractSynthesis(i,c));
 summarize:DiscussionProvider['summarize']=(i,c)=>this.dispatch('summarize',i,c,p=>p.summarize(i,c));
}
