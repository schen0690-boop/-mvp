import type { LineupMember } from './lineup.js';
export type DiscussionStatus = 'created' | 'generating_lineup' | 'awaiting_confirmation' | 'lineup_generation_failed' | 'lineup_confirmed';
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
  lineupRevision: number; confirmedLineupRevision: number | null; transcriptVersion: 0;
  roles: LineupMember[]; utterances: never[]; synthesis: null; summary: null;
  lastNotice: LineupNotice | null; stopReason: null; startedAt: null; endedAt: null;
  lineupGeneration?: LineupGeneration; confirmedAt?: string | null;
}
