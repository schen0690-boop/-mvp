import {enrichRoster} from '../../src/domain/lineup.js';
import type {DiscussionInput} from '../../src/domain/discussion.js';
export const adapterConfig={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'local-stub-credential',maxTokens:4096};
export function adapterInput():DiscussionInput{
 const discussionId=crypto.randomUUID(),roles=enrichRoster(['moderator','expert','expert'].map((r,i)=>({role:r==='moderator'?'moderator':'expert',name:`成员${i}`,profession:'教育',title:'研究员',stance:'以证据检验'})));
 return {discussionId,topic:'AI如何改善教育？',roles,sourceTranscriptVersion:3,synthesis:null,utterances:roles.map((r,i)=>({id:crypto.randomUUID(),discussionId,roleId:r.memberId,seq:i+1,sentences:['已有公开观点。'],replyToUtteranceIds:[],createdAt:new Date().toISOString()}))};
}
export const adapterContext=()=>({signal:new AbortController().signal,deadline:performance.now()+30000,runId:crypto.randomUUID(),epoch:1,taskId:crypto.randomUUID(),attemptNo:1,sourceTranscriptVersion:3});
