import { afterEach,expect,it } from 'vitest';
import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { DeepSeekRosterProvider,type RequestMetric } from '../../src/providers/deepseek.js';
const config={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'http-stub-dummy',maxTokens:4096};
const input={discussionId:'12345678-1234-4234-8234-123456789012',topic:'AI如何改善教育',expertCount:4,constraints:''};
const closes:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of closes.splice(0))await close();});
async function stub(handler:(req:IncomingMessage,res:ServerResponse)=>void){
  const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('stub address');
  closes.push(()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();}));
  const transport:typeof fetch=async(url,options)=>{expect(String(url)).toBe('https://api.deepseek.com/chat/completions');return fetch(`http://127.0.0.1:${address.port}/chat/completions`,options);};return transport;
}
it('native fetch sends actual POST to loopback stub and reads split JSON body',async()=>{
  let body='',authorization='',method='';const send=await stub((req,res)=>{authorization=String(req.headers.authorization);method=req.method??'';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{res.setHeader('Content-Type','application/json');res.write(' \n');res.end(JSON.stringify({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"roles":[]}'}}]}));});});
  expect(await new DeepSeekRosterProvider(config,send).generateRoster(input,{signal:new AbortController().signal,deadline:performance.now()+2000})).toBe('{"roles":[]}');expect(method).toBe('POST');expect(authorization).toBe('Bearer http-stub-dummy');expect(JSON.parse(body)).toMatchObject({thinking:{type:'disabled'},stream:false,max_tokens:4096});
});
it.each(['silent','keepalive'])('deadline includes headers and %s response body; abort closes actual socket',async mode=>{
  let ended=false;let closed!:()=>void;const socketClosed=new Promise<void>(resolve=>{closed=resolve;});
  const send=await stub((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();const interval=setInterval(()=>{if(mode==='keepalive')res.write(' \n');},10);res.once('close',()=>{ended=res.writableEnded;clearInterval(interval);closed();});});
  const metrics:RequestMetric[]=[];const start=performance.now();await expect(new DeepSeekRosterProvider(config,send,m=>metrics.push(m)).generateRoster(input,{signal:new AbortController().signal,deadline:performance.now()+150})).rejects.toMatchObject({kind:'timeout'});await socketClosed;expect(ended).toBe(false);expect(performance.now()-start).toBeLessThan(2000);expect(metrics[0]?.outcome).toBe('timeout');
});
it('explicit cancel after headers aborts body and is not a retryable timeout',async()=>{
  const controller=new AbortController();const send=await stub((_req,res)=>{res.writeHead(200);res.flushHeaders();controller.abort();});await expect(new DeepSeekRosterProvider(config,send).generateRoster(input,{signal:controller.signal,deadline:performance.now()+30000})).rejects.toMatchObject({kind:'cancelled',retryable:false});
});
it('redirect response never reaches redirect destination with Authorization',async()=>{
  let requests=0;const send=await stub((req,res)=>{requests++;res.writeHead(302,{Location:'/stolen'});res.end();});await expect(new DeepSeekRosterProvider(config,send).generateRoster(input,{signal:new AbortController().signal,deadline:performance.now()+2000})).rejects.toThrow();expect(requests).toBe(1);
});
