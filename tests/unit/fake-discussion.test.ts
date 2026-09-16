import {expect,it} from 'vitest';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
import {parseIntent,parseUtterance,parseSynthesis,parseSummary,type DiscussionInput} from '../../src/domain/discussion.js';
import type {DiscussionContext} from '../../src/providers/discussion.js';
import {enrichRoster} from '../../src/domain/lineup.js';
const roles=enrichRoster(['moderator','expert','expert'].map((r,i)=>({role:r==='moderator'?'moderator':'expert',name:`成员${i}`,profession:'教育',title:'研究员',stance:'证据'})));
const ctx:DiscussionContext={signal:new AbortController().signal,deadline:Infinity,runId:crypto.randomUUID(),epoch:1,taskId:crypto.randomUUID(),attemptNo:1,sourceTranscriptVersion:0};
it('Fake每次读取当前内容并形成可校验四能力输出',async()=>{
 const provider=new FakeDiscussionProvider();const input:DiscussionInput={discussionId:crypto.randomUUID(),topic:'教育',roles,utterances:[],synthesis:null,sourceTranscriptVersion:0};
 const opening=parseUtterance(await provider.generateUtterance({...input,member:roles[0]!,purpose:'opening',intent:null},ctx),input,'opening');
 input.utterances.push({id:crypto.randomUUID(),discussionId:input.discussionId,roleId:roles[0]!.memberId,seq:1,...opening,createdAt:new Date().toISOString()});input.sourceTranscriptVersion=1;
 const first=parseIntent(await provider.assessIntent({...input,member:roles[1]!},ctx),input);
 input.utterances[0]!.sentences=['讨论新观点。'];
 const changed=parseIntent(await provider.assessIntent({...input,member:roles[1]!},ctx),input);expect(changed.publicFocus).not.toEqual(first.publicFocus);
 const speech=parseUtterance(await provider.generateUtterance({...input,member:roles[1]!,purpose:'expert',intent:changed},ctx),input,'expert');expect(speech.replyToUtteranceIds).toEqual([input.utterances[0]!.id]);
 expect(parseSynthesis(await provider.extractSynthesis(input,ctx),input)).toEqual([]);
 expect(parseSummary(await provider.summarize({...input,member:roles[0]!,stopReason:'user_requested'},ctx))).toContain('Fake');
});
it('Fake按方法注入故障/可控迟到，不在入口预制全场',async()=>{
 const provider=new FakeDiscussionProvider({assessIntent:async()=>({wantsToSpeak:false})});
 expect(await provider.assessIntent({discussionId:'d',topic:'t',roles,utterances:[],synthesis:null,sourceTranscriptVersion:0,member:roles[1]!},ctx)).toEqual({wantsToSpeak:false});
});
