import {expect,it} from 'vitest';
import {callBudget,parseIntent,parseUtterance,parseSynthesis,parseSummary,rankCandidates,type DiscussionInput,type Candidate} from '../../src/domain/discussion.js';
import {enrichRoster} from '../../src/domain/lineup.js';
const roles=enrichRoster(['moderator','expert','expert'].map((role,i)=>({role:role==='moderator'?'moderator':'expert',name:`成员${i}`,profession:'教育',title:'研究员',stance:'讨论'})));
const input:DiscussionInput={discussionId:crypto.randomUUID(),topic:'教育',roles,sourceTranscriptVersion:3,synthesis:null,utterances:roles.map((m,i)=>({id:`u${i}`,discussionId:'same',roleId:m.memberId,seq:i+1,sentences:['已有观点。'],replyToUtteranceIds:[],createdAt:new Date().toISOString()}))};
input.utterances.forEach(u=>{u.discussionId=input.discussionId;});
const intent={wantsToSpeak:true,intent:'supplement',replyToUtteranceIds:['u2'],publicFocus:'关注证据'};
it('预算覆盖全部合法人数并拒绝非法值',()=>{expect(Array.from({length:8},(_,i)=>callBudget(i+1))).toEqual([84,112,140,168,196,224,252,280]);expect(()=>callBudget(0)).toThrow('invalid_');});
it('合法意愿精确校验，拒绝跨场/未来引用与系统字段',()=>{
 expect(parseIntent(intent,input)).toEqual(intent);
 for(const raw of [{...intent,score:1},{...intent,replyToUtteranceIds:['other']},{...intent,wantsToSpeak:1},{...intent,publicFocus:'<think>隐藏</think>'}])expect(()=>parseIntent(raw,input)).toThrow('invalid_');
});
it('正常中文短句保留引号与内部空格',()=>{expect(parseUtterance({sentences:['可以保留“内部 空格”。','如何验证？'],replyToUtteranceIds:['u2']},input,'expert').sentences).toHaveLength(2);});
it.each([[],['缺标点'],['一句。二句。'],['。'],['字'.repeat(160)+'。'],['<think>内容</think>。'],['一。','二。','三。']].map(sentences=>({sentences})))('无效句子不截断修复 $sentences',({sentences})=>{expect(()=>parseUtterance({sentences,replyToUtteranceIds:['u2']},input,'expert')).toThrow('invalid_');});
it('专家必须引用已提交发言且Provider不能指定roleId',()=>{
 expect(()=>parseUtterance({sentences:['发言。'],replyToUtteranceIds:[]},input,'expert')).toThrow('invalid_');
 expect(()=>parseUtterance({sentences:['发言。'],replyToUtteranceIds:['u2'],roleId:roles[0]!.memberId},input,'expert')).toThrow('invalid_');
 expect(parseUtterance({sentences:['开场。'],replyToUtteranceIds:[]},input,'opening').sentences).toEqual(['开场。']);
});
it('共识需要两位专家证据，空观点合法',()=>{
 const item={kind:'consensus',text:'共同观点',evidenceUtteranceIds:['u1','u2'],positions:[]};
 expect(parseSynthesis({items:[item]},input)).toEqual([item]);expect(parseSynthesis({items:[]},input)).toEqual([]);
 expect(()=>parseSynthesis({items:[{...item,evidenceUtteranceIds:['u0','u1']}]},input)).toThrow('invalid_');
 expect(()=>parseSynthesis({items:[{...item,evidenceUtteranceIds:['u1','other']}]},input)).toThrow('invalid_');
});
it('分歧两立场的证据并集必须与顶层相符',()=>{
 const item={kind:'disagreement',text:'有分歧',evidenceUtteranceIds:['u1','u2'],positions:[{text:'先试点',evidenceUtteranceIds:['u1']},{text:'先评估',evidenceUtteranceIds:['u2']}]};
 expect(parseSynthesis({items:[item]},input)).toEqual([item]);expect(()=>parseSynthesis({items:[{...item,positions:[]}]},input)).toThrow('invalid_');
});
it('总结只能自然语言且不接收Provider系统字段',()=>{expect(parseSummary({text:'保留不同意见。'})).toBe('保留不同意见。');expect(()=>parseSummary({text:'完成。',status:'ready'})).toThrow('invalid_');});
it('协调不按返回先后；持续申请优先且有他人时避免第三次连续',()=>{
 const candidates:Candidate[]=roles.slice(1).map(member=>({member,intent:parseIntent(intent,input)}));
 expect(rankCandidates(candidates,input,new Map())).toEqual(rankCandidates([...candidates].reverse(),input,new Map()));
 const second=candidates[1]!;expect(rankCandidates(candidates,input,new Map([[second.member.memberId,3]]))[0]).toEqual(second);
 const repeated={...input,utterances:[...input.utterances,input.utterances[2]!]};
 expect(rankCandidates(candidates,repeated,new Map())[0]).toEqual(candidates[0]);
 expect(rankCandidates([second],repeated,new Map())).toEqual([second]);
});
