import {expect,it,vi} from 'vitest';
import {DeepSeekDiscussionProvider} from '../../src/providers/deepseek-discussion.js';
import {enrichRoster} from '../../src/domain/lineup.js';
import type {DiscussionInput} from '../../src/domain/discussion.js';
export const config={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'local-stub-credential',maxTokens:4096};
export function input():DiscussionInput{
 const discussionId=crypto.randomUUID(),roles=enrichRoster(['moderator','expert','expert'].map((r,i)=>({role:r==='moderator'?'moderator':'expert',name:`成员${i}`,profession:'教育',title:'研究员',stance:'以证据检验'})));
 return {discussionId,topic:'AI如何改善教育？',roles,sourceTranscriptVersion:3,synthesis:null,utterances:roles.map((r,i)=>({id:crypto.randomUUID(),discussionId,roleId:r.memberId,seq:i+1,sentences:['已有公开观点。'],replyToUtteranceIds:[],createdAt:new Date().toISOString()}))};
}
export const context=()=>({signal:new AbortController().signal,deadline:performance.now()+30000,runId:crypto.randomUUID(),epoch:1,taskId:crypto.randomUUID(),attemptNo:1,sourceTranscriptVersion:3});
export const completion=(value:unknown)=>({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});
it('安全metric记录请求/响应模型、发送时刻和业务校验结果',async()=>{
 const metrics:unknown[]=[],i=input();const p=new DeepSeekDiscussionProvider(config,async()=>Response.json({...completion({text:'仍需课堂验证。'}),model:'deepseek-flash'}),m=>metrics.push(m));await p.summarize({...i,member:i.roles[0]!,stopReason:'user_requested'},context());expect(metrics[0]).toMatchObject({requestedModel:'deepseek-flash',responseModel:'deepseek-flash',startedAt:expect.any(String),validResult:true});
});
it('意愿可明确不申请；四种操作发送独立任务JSON并使用不同输出上限',async()=>{
 const i=input(),outputs=[{wantsToSpeak:false,intent:'answer',replyToUtteranceIds:[],publicFocus:null},{sentences:['回应当前观点。'],replyToUtteranceIds:[i.utterances[2]!.id]},{items:[]},{text:'尚有争议需要验证。'}];
 const send=vi.fn(async()=>Response.json(completion(outputs.shift())));const p=new DeepSeekDiscussionProvider(config,send);
 expect(await p.assessIntent({...i,member:i.roles[1]!},context())).toMatchObject({wantsToSpeak:false});
 expect(await p.generateUtterance({...i,member:i.roles[1]!,purpose:'expert',intent:null},context())).toHaveProperty('sentences');
 expect(await p.extractSynthesis(i,context())).toEqual({items:[]});expect(await p.summarize({...i,member:i.roles[0]!,stopReason:'user_requested'},context())).toEqual({text:'尚有争议需要验证。'});
 const calls=send.mock.calls as unknown as [string,RequestInit][];
 expect(calls.map(c=>JSON.parse(String(c[1].body)).max_tokens)).toEqual([512,768,4096,1024]);
 expect(calls.map(c=>JSON.parse(JSON.parse(String(c[1].body)).messages[1].content).operation)).toEqual(['assessIntent','generateUtterance','extractSynthesis','summarize']);
});
it('非法输出字段/引用/句数拒绝而不补造系统字段',async()=>{
 const i=input();for(const output of [{sentences:['甲。','乙。','丙。'],replyToUtteranceIds:[]},{sentences:['发言。'],replyToUtteranceIds:['other']},{sentences:['发言。'],replyToUtteranceIds:[],roleId:i.roles[0]!.memberId}]){
  await expect(new DeepSeekDiscussionProvider(config,async()=>Response.json(completion(output))).generateUtterance({...i,member:i.roles[1]!,purpose:'expert',intent:null},context())).rejects.toThrow('invalid_');
 }
});
