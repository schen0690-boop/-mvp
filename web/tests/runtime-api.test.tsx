import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {sample} from './lineup-fixtures.js';
import {decodeSnapshot,createApi,statusLabels} from '../src/api.js';
import {LineupPanel} from '../src/LineupPanel.js';
import {runtimeNotice,type DiscussionSnapshot} from '../../src/domain/snapshot.js';
function runtime(status:'running'|'stopping'|'completed'|'failed'):DiscussionSnapshot{
 const base=sample('lineup_confirmed'),start='2026-09-16T00:01:00.000Z',stop='2026-09-16T00:02:00.000Z',end='2026-09-16T00:02:01.000Z';
 const stopping=status==='stopping'||status==='completed',terminal=status==='completed'||status==='failed';
 return {...base,status,version:10,lastEventId:12,updatedAt:end,startedAt:start,endedAt:terminal?end:null,stopReason:stopping?'user_requested':null,
  transcriptVersion:1,utterances:[{id:crypto.randomUUID(),discussionId:base.discussionId,roleId:base.roles[0]!.memberId,seq:1,sentences:['欢迎讨论。'],replyToUtteranceIds:[],createdAt:start}],
  runtime:{runId:crypto.randomUUID(),runDeadlineAt:'2026-09-16T00:11:00.000Z',stoppingAt:stopping?stop:null,stopDeadlineAt:stopping?'2026-09-16T00:03:00.000Z':null},
  roleStates:base.roles.map(m=>({roleId:m.memberId,status:'idle',publicFocus:null,focusSourceTranscriptVersion:null,updatedAt:start})),synthesisState:'idle',
  summary:status==='completed'?{status:'unavailable',text:null,sourceTranscriptVersion:1}:null,lastNotice:status==='completed'?runtimeNotice('SUMMARY_UNAVAILABLE'):status==='failed'?runtimeNotice('RUN_INTERRUPTED'):null};
}
it.each(['running','stopping','completed','failed'] as const)('严格接收新运行状态%s，确认时间不改、版本不相等',status=>{const s=runtime(status);expect(decodeSnapshot(s)).toEqual(s);expect(statusLabels[status]).toBeTruthy();});
it('运行字段仍严格校验，不能靠放开旧断言任意接受',()=>{
 const s=runtime('completed');
 for(const invalid of [{...s,lastEventId:s.version-1},{...s,transcriptVersion:2},{...s,confirmedAt:s.updatedAt},{...s,summary:{status:'ready',text:null,sourceTranscriptVersion:1}},{...s,runtime:{...s.runtime,taskId:'internal'}},{...s,roleStates:[]},{...s,utterances:[{...s.utterances[0],roleId:crypto.randomUUID()}]},{...s,endedAt:null},{...s,lastNotice:{...s.lastNotice,message:'private diagnostic'}}])expect(()=>decodeSnapshot(invalid)).toThrow('返回的数据不符合约定');
});
it('active列表接受running/stopping，completed不误列为进行中',async()=>{
 const s=runtime('running'),item={discussionId:s.discussionId,topic:s.topic,expertCount:s.expertCount,status:s.status,version:s.version,updatedAt:s.updatedAt};
 const api=createApi(async()=>new Response(JSON.stringify({items:[item]})));expect(await api.list('active')).toEqual([item]);
 item.status='completed';await expect(api.list('active')).rejects.toThrow();
});
it('运行/总结不可用显示安全中文文本，没有新增业务控制或演播厅',()=>{
 for(const status of ['running','stopping','completed','failed'] as const){const s=runtime(status);const html=renderToStaticMarkup(<LineupPanel snapshot={s} busy={false} error="" notice="" checking={false} generate={()=>{}} confirm={()=>{}} recheck={()=>{}}/>);
  expect(html).toContain(status==='completed'?'总结生成失败':statusLabels[status]);expect(html).not.toMatch(/>开始讨论<|>结束讨论<|>重新生成<|>确认阵容</);expect(html).not.toContain('欢迎讨论。');
 }
});
