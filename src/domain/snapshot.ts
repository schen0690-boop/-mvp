import type { LineupMember } from './lineup.js';
import type {Utterance,Synthesis,Summary,StopReason,RoleState,SynthesisState} from './discussion.js';
export type DiscussionStatus = 'created' | 'generating_lineup' | 'awaiting_confirmation' | 'lineup_generation_failed' | 'lineup_confirmed' | 'running' | 'stopping' | 'completed' | 'failed';
export function isRuntimeStatus(s:unknown):s is 'running'|'stopping'|'completed'|'failed'{return s==='running'||s==='stopping'||s==='completed'||s==='failed';}
export const runtimeMessages={RUN_START_FAILED:'讨论执行器启动失败',RUN_INTERRUPTED:'上次讨论执行已中断',HOST_UNAVAILABLE:'主持人暂时无法继续',DISCUSSION_PARTICIPATION_UNAVAILABLE:'当前无法取得有效专家回应',DISCUSSION_PROVIDER_CONFIGURATION:'讨论服务配置不可用',CONTEXT_LIMIT:'讨论上下文超出本版限制',RUNTIME_STORAGE_FAILED:'讨论记录暂时无法保存',SYNTHESIS_UNAVAILABLE:'观点更新失败，保留之前有效观点',SUMMARY_UNAVAILABLE:'讨论已结束，总结生成失败',SUMMARY_NO_CONTENT:'未产生公开发言，无可用总结'};
export type RuntimeNoticeCode=keyof typeof runtimeMessages;
export interface RuntimeNotice {code:RuntimeNoticeCode;message:string;retryable:false;action:'none'|'new_discussion'}
export function runtimeNotice(code:string):RuntimeNotice{
 for(const key of Object.keys(runtimeMessages) as RuntimeNoticeCode[])if(key===code)return {code:key,message:runtimeMessages[key],retryable:false,action:key.startsWith('SUMMARY_')||key==='SYNTHESIS_UNAVAILABLE'?'none':'new_discussion'};
 throw new Error('INVALID_RUNTIME_NOTICE');
}
export const noticeMessages = {
  LINEUP_PROVIDER_UNAVAILABLE: '阵容生成服务暂时不可用，请重试',
  LINEUP_PROVIDER_CONFIGURATION: '阵容生成服务配置不可用，请联系维护者',
  LINEUP_TIMEOUT: '阵容生成超时，请重试',
  LINEUP_INVALID_STRUCTURE: '生成结果格式不符合要求，请重试',
  LINEUP_INVALID_MEMBERS: '生成的成员不符合要求，请重试',
  LINEUP_STORAGE_FAILED: '阵容保存失败，请重试',
  LINEUP_INTERRUPTED: '上次阵容生成已中断，请重试'
};
export type NoticeCode = keyof typeof noticeMessages;
export interface LineupNotice { code: NoticeCode; message: string; retryable: boolean; action: 'none' | 'try_again' }
export function noticeOf(code: NoticeCode): LineupNotice {
  const retryable = code !== 'LINEUP_PROVIDER_CONFIGURATION';
  return { code, message: noticeMessages[code], retryable, action: retryable ? 'try_again' : 'none' };
}
export interface LineupGeneration { generationId: string; generationVersion: number; startedAt: string; finishedAt: string | null }
export interface DiscussionSnapshot {
  discussionId: string; topic: string; expertCount: number; status: DiscussionStatus;
  version: number; lastEventId: number; createdAt: string; updatedAt: string;
  lineupRevision: number; confirmedLineupRevision: number | null; transcriptVersion: number;
  roles: LineupMember[]; utterances: Utterance[]; synthesis: Synthesis|null; summary: Summary|null;
  lastNotice: LineupNotice | RuntimeNotice | null; stopReason: StopReason|null; startedAt: string|null; endedAt: string|null;
  lineupGeneration?: LineupGeneration; confirmedAt?: string | null;
  runtime?:{runId:string;runDeadlineAt:string;stoppingAt:string|null;stopDeadlineAt:string|null};
  roleStates?:RoleState[];synthesisState?:SynthesisState;
}
