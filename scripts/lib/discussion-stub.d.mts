import type {ServerResponse} from 'node:http';
import type {SpeechInput,SummaryInput} from '../../src/providers/discussion.js';
export interface Task {operation:'assessIntent'|'generateUtterance'|'extractSynthesis'|'summarize';input:SpeechInput&SummaryInput}
export interface Body {model:string;messages:{role:string;content:string}[];thinking:{type:string};stream:boolean;response_format:{type:string};max_tokens:number;tools?:unknown}
export function answerTask(task:Task):unknown;
export function envelope(value:unknown):{model:string;choices:{index:number;finish_reason:string;message:{role:string;content:string;reasoning_content:string}}[];usage:Record<string,number>};
export function startDiscussionStub(hook?:(task:Task,response:ServerResponse,n:number,body:Body)=>boolean|Promise<boolean>):Promise<{requests:{body:Body;task:Task}[];transport:typeof fetch;readonly maxActive:number;close:()=>Promise<void>}>;
