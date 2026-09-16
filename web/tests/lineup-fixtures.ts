import { enrichRoster } from '../../src/domain/lineup.js';
import { noticeOf } from '../../src/domain/snapshot.js';
import { decodeSnapshot } from '../src/api.js';
const id='11111111-1111-4111-8111-111111111111', gen='22222222-2222-4222-8222-222222222222', time='2026-09-16T00:00:00.000Z';
function rawSample(status:string){
  const ready=status==='awaiting_confirmation'||status==='lineup_confirmed';
  return {discussionId:id,topic:'中文',expertCount:1,status,version:status==='generating_lineup'?2:status==='lineup_confirmed'?4:3,lastEventId:status==='generating_lineup'?2:status==='lineup_confirmed'?4:3,
    createdAt:time,updatedAt:time,lineupRevision:ready?1:0,confirmedLineupRevision:status==='lineup_confirmed'?1:null,
    transcriptVersion:0,roles:ready?enrichRoster([{role:'moderator',name:'主持',profession:'沟通',title:'主持人',stance:'中立'},{role:'expert',name:'专家',profession:'研究',title:'研究员',stance:'独立判断'}]):[],
    utterances:[],synthesis:null,summary:null,lastNotice:status==='lineup_generation_failed'?noticeOf('LINEUP_TIMEOUT'):null,stopReason:null,startedAt:null,endedAt:null,
    lineupGeneration:{generationId:gen,generationVersion:1,startedAt:time,finishedAt:status==='generating_lineup'?null:time},confirmedAt:status==='lineup_confirmed'?time:null};
}

export const sample = (status: string) => decodeSnapshot(rawSample(status));
