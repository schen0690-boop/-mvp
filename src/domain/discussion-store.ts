import type {DiscussionSnapshot} from './snapshot.js';
import type {FindingCandidate,RoleState,Speech,StopReason} from './discussion.js';
export interface StartInput {requestId:string;generationId:string;lineupRevision:number}
export interface RunKey {discussionId:string;runId:string;epoch:number;sourceTranscriptVersion:number}
export interface RunState {snapshot:DiscussionSnapshot;key:RunKey;requestId:string|null;callsUsed:number;callLimit:number;summaryCallsUsed:number;expertTurns:number}
export interface StartResult {discussionId:string;runId:string;snapshot:DiscussionSnapshot;replayed:boolean}
export interface DiscussionStore {
 state(id:string):RunState|undefined;
 begin(id:string,input:StartInput):StartResult;
 reserve(key:RunKey,summary:boolean):boolean;
 role(key:RunKey,roleId:string,status:RoleState['status'],focus?:string|null):boolean;
 append(key:RunKey,roleId:string,speech:Speech):boolean;
 synthesisStatus(key:RunKey,status:'preparing'|'failed'):boolean;
 synthesize(key:RunKey,items:FindingCandidate[]):boolean;
 stop(id:string,reason:StopReason):DiscussionSnapshot;
 finish(key:RunKey,text:string|null):boolean;
 fail(id:string,code:string):void;
 recover():void;
}
