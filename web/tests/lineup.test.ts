import { expect, it } from 'vitest';
import { createApi, decodeSnapshot } from '../src/api.js';
import { enrichRoster } from '../../src/domain/lineup.js';
import { noticeOf } from '../../src/domain/snapshot.js';
const id='11111111-1111-4111-8111-111111111111', gen='22222222-2222-4222-8222-222222222222', time='2026-09-16T00:00:00.000Z';
function sample(status:string){
  const ready=status==='awaiting_confirmation'||status==='lineup_confirmed';
  return {discussionId:id,topic:'中文',expertCount:1,status,version:status==='generating_lineup'?2:status==='lineup_confirmed'?4:3,lastEventId:status==='generating_lineup'?2:status==='lineup_confirmed'?4:3,
    createdAt:time,updatedAt:time,lineupRevision:ready?1:0,confirmedLineupRevision:status==='lineup_confirmed'?1:null,
    transcriptVersion:0,roles:ready?enrichRoster([{role:'moderator',name:'主持',profession:'沟通',title:'主持人',stance:'中立'},{role:'expert',name:'专家',profession:'研究',title:'研究员',stance:'独立判断'}]):[],
    utterances:[],synthesis:null,summary:null,lastNotice:status==='lineup_generation_failed'?noticeOf('LINEUP_TIMEOUT'):null,stopReason:null,startedAt:null,endedAt:null,
    lineupGeneration:{generationId:gen,generationVersion:1,startedAt:time,finishedAt:status==='generating_lineup'?null:time},confirmedAt:status==='lineup_confirmed'?time:null};
}
it.each(['generating_lineup','awaiting_confirmation','lineup_generation_failed','lineup_confirmed'])('decodes complete safe %s DTO',status=>{
  const dto=sample(status);expect(decodeSnapshot(dto)).toEqual(dto);
});
it('rejects unknown fields, historical roles in failure, invalid versions and system member fields',()=>{
  const ready=sample('awaiting_confirmation'),failed=sample('lineup_generation_failed');
  for(const dto of [{...ready,raw:'private'},{...failed,roles:ready.roles},{...ready,lineupRevision:2},{...ready,lastEventId:99},
    {...ready,roles:ready.roles.map(r=>({...r,generationId:gen}))},{...ready,roles:ready.roles.map(r=>({...r,color:'#ffffff'}))},
    {...sample('lineup_confirmed'),confirmedLineupRevision:2},{...failed,lastNotice:{...failed.lastNotice,message:'private SQL'}},
    {...sample('generating_lineup'),lineupGeneration:{generationId:gen,generationVersion:1,startedAt:time,finishedAt:time}}])expect(()=>decodeSnapshot(dto)).toThrow();
});
it('creation idempotency replay can contain a current confirmed snapshot',async()=>{
  const dto=sample('lineup_confirmed');const api=createApi(async()=>new Response(JSON.stringify({discussionId:id,snapshot:dto,replayed:true}),{status:200}));
  expect((await api.create({topic:'中文',expertCount:1,requestId:gen})).snapshot.status).toBe('lineup_confirmed');
});
it('active list accepts generating/ready but refuses created and confirmed',async()=>{
  const item=(status:string)=>{const s=sample(status);return {discussionId:id,topic:s.topic,expertCount:1,status,version:s.version,updatedAt:time};};
  for(const status of ['generating_lineup','awaiting_confirmation']){
    const api=createApi(async()=>new Response(JSON.stringify({items:[item(status)]})));expect(await api.list('active')).toEqual([item(status)]);
  }
  const api=createApi(async()=>new Response(JSON.stringify({items:[item('lineup_confirmed')]})));await expect(api.list('active')).rejects.toThrow();
});
