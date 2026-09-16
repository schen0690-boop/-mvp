import type {DiscussionInput,Purpose,Intent,StopReason} from '../domain/discussion.js';
import type {LineupMember} from '../domain/lineup.js';
export class CallBudgetError extends Error {constructor(){super('call_budget_exhausted');}}
export interface DiscussionContext {signal:AbortSignal;deadline:number;runId:string;epoch:number;taskId:string;attemptNo:number;sourceTranscriptVersion:number;repairIssues?:{path:string;rule:string}[]}
export interface IntentInput extends DiscussionInput {member:LineupMember}
export interface SpeechInput extends IntentInput {purpose:Purpose;intent:Intent|null}
export interface SummaryInput extends DiscussionInput {member:LineupMember;stopReason:StopReason}
export interface DiscussionProvider {
 assessIntent(input:IntentInput,context:DiscussionContext):Promise<unknown>;
 generateUtterance(input:SpeechInput,context:DiscussionContext):Promise<unknown>;
 extractSynthesis(input:DiscussionInput,context:DiscussionContext):Promise<unknown>;
 summarize(input:SummaryInput,context:DiscussionContext):Promise<unknown>;
}
