import type { LineupMember } from './lineup.js';
import { exactKeys } from './lineup.js';
import { isObject } from './input.js';
export interface Utterance { id:string;discussionId:string;roleId:string;seq:number;sentences:string[];replyToUtteranceIds:string[];createdAt:string }
export interface Position {text:string;evidenceUtteranceIds:string[]}
export interface FindingCandidate {kind:'consensus'|'disagreement';text:string;evidenceUtteranceIds:string[];positions:Position[]}
export interface Finding extends FindingCandidate {id:string}
export interface Synthesis {sourceTranscriptVersion:number;items:Finding[];updatedAt:string}
export interface Summary {status:'ready'|'unavailable';text:string|null;sourceTranscriptVersion:number}
export interface DiscussionInput {discussionId:string;topic:string;roles:LineupMember[];utterances:Utterance[];synthesis:Synthesis|null;sourceTranscriptVersion:number}
export interface Intent {wantsToSpeak:boolean;intent:'answer'|'supplement'|'rebuttal'|'question';replyToUtteranceIds:string[];publicFocus:string|null}
export interface Speech {sentences:string[];replyToUtteranceIds:string[]}
export type Purpose='opening'|'clarify'|'bridge'|'expert';
export type StopReason='user_requested'|'turn_limit'|'duration_limit'|'no_participation'|'synthesis_unavailable'|'call_budget_exhausted';
export type SynthesisState='idle'|'preparing'|'ready'|'failed';
export interface RoleState {roleId:string;status:'idle'|'preparing'|'speaking';publicFocus:string|null;focusSourceTranscriptVersion:number|null;updatedAt:string}
export class DiscussionValidationError extends Error {
 constructor(readonly kind:'invalid_structure'|'invalid_content'){super(kind);}
}
function invalid():never{throw new DiscussionValidationError('invalid_content');}
function object(raw:unknown,keys:string[]):Record<string,unknown>{
 if(!isObject(raw)||!exactKeys(raw,keys)||new TextEncoder().encode(JSON.stringify(raw)).length>16384)throw new DiscussionValidationError('invalid_structure');return raw;
}
export function publicText(value:unknown,max:number):string{
 if(typeof value!=='string')invalid();const s=value.trim();
 if(!s||[...s].length>max||/[\u0000-\u001f\u007f]|```|<[^>]*>|(?:reasoning_content|hidden_reasoning)/iu.test(s))invalid();
 try {const parsed:unknown=JSON.parse(s);if(parsed!==null&&typeof parsed==='object')invalid();}catch(e){if(e instanceof DiscussionValidationError)throw e;}
 return s;
}
export function sentence(value:unknown):string{
 const s=publicText(value,160);if(!/^[^。！？!?]+[。！？!?]+[”’"'）)]*$/u.test(s))invalid();return s;
}
function references(value:unknown,input:DiscussionInput,min:number,max:number):string[]{
 if(!Array.isArray(value)||value.length<min||value.length>max)invalid();
 const ids=value.map((id:unknown)=>{if(typeof id!=='string'||!input.utterances.some(u=>u.id===id&&u.discussionId===input.discussionId&&u.seq<=input.sourceTranscriptVersion))invalid();return id;});
 if(new Set(ids).size!==ids.length)invalid();return ids;
}
export function parseIntent(raw:unknown,input:DiscussionInput):Intent {
 const r=object(raw,['wantsToSpeak','intent','replyToUtteranceIds','publicFocus']);
 if(typeof r.wantsToSpeak!=='boolean'||(r.intent!=='answer'&&r.intent!=='supplement'&&r.intent!=='rebuttal'&&r.intent!=='question'))invalid();
 return {wantsToSpeak:r.wantsToSpeak,intent:r.intent,replyToUtteranceIds:references(r.replyToUtteranceIds,input,r.wantsToSpeak?1:0,3),publicFocus:r.publicFocus===null?null:publicText(r.publicFocus,80)};
}
export function parseUtterance(raw:unknown,input:DiscussionInput,purpose:Purpose):Speech {
 const r=object(raw,['sentences','replyToUtteranceIds']);if(!Array.isArray(r.sentences)||r.sentences.length<1||r.sentences.length>2)invalid();
 return {sentences:r.sentences.map(sentence),replyToUtteranceIds:references(r.replyToUtteranceIds,input,purpose==='opening'?0:1,3)};
}
export function parseSynthesis(raw:unknown,input:DiscussionInput):FindingCandidate[] {
 const r=object(raw,['items']);if(!Array.isArray(r.items)||r.items.length>12)invalid();
 const expertIds=new Set(input.roles.filter(m=>m.role==='expert').map(m=>m.memberId));
 const speakers=(ids:string[])=>new Set(input.utterances.filter(u=>ids.includes(u.id)&&expertIds.has(u.roleId)).map(u=>u.roleId));
 return r.items.map((item:unknown)=>{
  const o=object(item,['kind','text','evidenceUtteranceIds','positions']);if(o.kind!=='consensus'&&o.kind!=='disagreement')invalid();
  const evidence=references(o.evidenceUtteranceIds,input,2,16);if(speakers(evidence).size<2||!Array.isArray(o.positions))invalid();
  const positions=o.positions.map((p:unknown)=>{const v=object(p,['text','evidenceUtteranceIds']);return {text:publicText(v.text,160),evidenceUtteranceIds:references(v.evidenceUtteranceIds,input,1,8)};});
  if(o.kind==='consensus'&&positions.length!==0)invalid();
  if(o.kind==='disagreement'){
   if(positions.length!==2)invalid();
   const a=speakers(positions[0]!.evidenceUtteranceIds),b=speakers(positions[1]!.evidenceUtteranceIds);
   if(![...a].some(id=>[...b].some(other=>other!==id)))invalid();
   const union=new Set(positions.flatMap(p=>p.evidenceUtteranceIds));if(union.size!==evidence.length||evidence.some(id=>!union.has(id)))invalid();
  }
  return {kind:o.kind,text:publicText(o.text,300),evidenceUtteranceIds:evidence,positions};
 });
}
export function parseSummary(raw:unknown):string {
 const text=publicText(object(raw,['text']).text,320),parts=text.match(/[^。！？!?]+[。！？!?]+[”’"'）)]*/gu);
 if(!parts||parts.length<1||parts.length>2||parts.join('')!==text)invalid();parts.forEach(sentence);return text;
}
export function callBudget(n:number):number {if(!Number.isInteger(n)||n<1||n>8)invalid();return 28*n+56;}
export interface Candidate {member:LineupMember;intent:Intent}
export function rankCandidates(c:Candidate[],input:DiscussionInput,waiting:Map<string,number>):Candidate[]{
 const expertIds=new Set(input.roles.filter(m=>m.role==='expert').map(m=>m.memberId));
 const past=input.utterances.filter(u=>expertIds.has(u.roleId)),last=past.at(-1)?.roleId;
 const valid=c.filter(x=>x.intent.wantsToSpeak&&expertIds.has(x.member.memberId));
 const pool=last&&past.at(-2)?.roleId===last&&valid.some(x=>x.member.memberId!==last)?valid.filter(x=>x.member.memberId!==last):valid;
 const wait=(x:Candidate)=>waiting.get(x.member.memberId)??0;
 const relevance=(x:Candidate)=>['rebuttal','supplement'].includes(x.intent.intent)&&x.intent.replyToUtteranceIds.includes(input.utterances.at(-1)?.id??'')?1:0;
 const count=(x:Candidate)=>past.filter(u=>u.roleId===x.member.memberId).length;
 const ranked=[...pool].sort((a,b)=>Number(wait(b)>=3)-Number(wait(a)>=3)||relevance(b)-relevance(a)||wait(b)-wait(a)||count(a)-count(b)||a.member.memberId.localeCompare(b.member.memberId));
 // The previous speaker is a fallback only after all alternatives fail validation.
 return [...ranked,...valid.filter(c=>!pool.includes(c))];
}
