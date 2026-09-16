// Test-only HTTP service. Every response is derived from the received task/context.
import {createServer} from 'node:http';
export function answerTask({operation,input:i}){
 const last=i.utterances.at(-1);
 if(operation==='assessIntent')return {wantsToSpeak:!!last,intent:'supplement',replyToUtteranceIds:last?[last.id]:[],publicFocus:last?`关注第${last.seq}条的课堂证据`:null};
 if(operation==='generateUtterance')return {sentences:[i.purpose==='opening'?'请围绕课堂效果与教育公平提出可验证的意见。':`回应第${last.seq}条观点，我建议结合课堂证据进行小范围验证。`],replyToUtteranceIds:last?[last.id]:[]};
 if(operation==='extractSynthesis'){
  const ids=new Map();for(const u of i.utterances)if(i.roles.some(r=>r.role==='expert'&&r.memberId===u.roleId))ids.set(u.roleId,u.id);
  return {items:ids.size<2?[]:[{kind:'consensus',text:'已发言的专家均建议以课堂证据开展小范围验证。',evidenceUtteranceIds:[...ids.values()],positions:[]}]};
 }
 if(operation==='summarize')return {text:`本场已提交${i.utterances.length}条发言，最后一条仍建议以课堂证据进行验证。这些意见需要实际检验，不能据此证明教育效果。`};
 throw Error('UNKNOWN_TEST_OPERATION');
}
export function envelope(value){return {model:'deepseek-flash',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value),reasoning_content:'STUB_PRIVATE_REASONING'}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};}
export async function startDiscussionStub(hook){
 const requests=[];let active=0,maxActive=0;
 const server=createServer(async(req,res)=>{
  try{
   if(req.method!=='POST'||req.url!=='/chat/completions'||req.headers.authorization!=='Bearer local-stub-credential')throw Error('INVALID_LOCAL_REQUEST');
   let text='';for await(const part of req){text+=part;if(text.length>262144)throw Error('REQUEST_TOO_LARGE');}
   const body=JSON.parse(text),task=JSON.parse(body.messages[1].content);requests.push({body,task});active++;maxActive=Math.max(active,maxActive);
   try{if(hook&&await hook(task,res,requests.length,body))return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(envelope(answerTask(task))));}finally{active--;}
  }catch{res.statusCode=500;res.end('LOCAL_STUB_FAILURE');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();if(!address||typeof address==='string')throw Error('NO_LOCAL_PORT');
 const nativeFetch=globalThis.fetch;
 // Tests inject this explicit bridge. The production config still requires the official URL.
 const transport=async(url,init)=>{
  if(String(url)!=='https://api.deepseek.com/chat/completions')throw Error('UNEXPECTED_PRODUCTION_URL');
  if(init?.redirect!=='error')throw Error('REDIRECT_POLICY_REQUIRED');
  return nativeFetch(`http://127.0.0.1:${address.port}/chat/completions`,init);
 };
 return {requests,transport,get maxActive(){return maxActive;},close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
