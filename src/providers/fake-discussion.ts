import type {DiscussionProvider} from './discussion.js';
export class FakeDiscussionProvider implements DiscussionProvider {
 constructor(private readonly hooks:Partial<DiscussionProvider>={}){}
 assessIntent:DiscussionProvider['assessIntent']=async(input,ctx)=>{
  if(this.hooks.assessIntent)return this.hooks.assessIntent(input,ctx);
  const last=input.utterances.at(-1);
  return {wantsToSpeak:!!last,intent:'supplement',replyToUtteranceIds:last?[last.id]:[],publicFocus:last?`关注第${last.seq}条：${excerpt(last.sentences.join(''))}`:null};
 };
 generateUtterance:DiscussionProvider['generateUtterance']=async(input,ctx)=>{
  if(this.hooks.generateUtterance)return this.hooks.generateUtterance(input,ctx);
  const last=input.utterances.at(-1),source=excerpt(last?.sentences.join('')??input.topic);
  return {sentences:[input.purpose==='opening'?`本场Fake讨论聚焦${source}，请提出可验证的意见。`:`针对第${last?.seq??0}条的${source}，我从${excerpt(input.member.stance)}角度建议先做小规模验证。`],replyToUtteranceIds:last?[last.id]:[]};
 };
 extractSynthesis:DiscussionProvider['extractSynthesis']=async(input,ctx)=>{
  if(this.hooks.extractSynthesis)return this.hooks.extractSynthesis(input,ctx);
  const experts=new Set(input.roles.filter(m=>m.role==='expert').map(m=>m.memberId));const evidence=new Map<string,string>();
  for(const u of input.utterances)if(experts.has(u.roleId))evidence.set(u.roleId,u.id);
  return {items:evidence.size<2?[]:[{kind:'consensus',text:'这些Fake发言均建议先做小规模验证，尚不能代表全体一致。',evidenceUtteranceIds:[...evidence.values()].slice(0,8),positions:[]}]};
 };
 summarize:DiscussionProvider['summarize']=async(input,ctx)=>{
  if(this.hooks.summarize)return this.hooks.summarize(input,ctx);
  return {text:`本场Fake讨论已保存${input.utterances.length}条发言，最后关注${excerpt(input.utterances.at(-1)?.sentences.join('')??input.topic)}。仍需真实证据检验，不能据此认定讨论质量已验证。`};
 };
}
// Synthetic wording only; never truncates a provider candidate to bypass validation.
function excerpt(s:string):string{return [...s.replace(/[。！？!?\u0000-\u001f<>]/gu,'')].slice(0,24).join('');}
