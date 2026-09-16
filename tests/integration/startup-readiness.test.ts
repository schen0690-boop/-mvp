import {test,expect} from 'vitest';
import {createServer,type Server} from 'node:http';
import {readFileSync} from 'node:fs';
import {waitForSnapshot,cleanupOnce} from '../../scripts/startup/readiness.js';
const fixture:unknown=JSON.parse(readFileSync('evidence/stage-6b/local-dry-H523q8/initial.json','utf8'));
const binding={discussionId:'',generationId:'',lineupRevision:1};
// Use the same existing public DTO decoder as the launch checker.
import {decodeSnapshot} from '../../web/src/api.js';
const snapshot=decodeSnapshot(fixture);binding.discussionId=snapshot.discussionId;binding.generationId=snapshot.lineupGeneration!.generationId;
const options={timeoutMs:180,requestTimeoutMs:40,intervalMs:5,maxAttempts:4};
async function listen(server:Server){await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();if(!a||typeof a==='string')throw Error('NO_PORT');return `http://127.0.0.1:${a.port}/api/discussions/${binding.discussionId}`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
test('native Fetch Response + existing confirmed snapshot is ready',async()=>{const server=createServer((_q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify(fixture));});const url=await listen(server);try{expect(await waitForSnapshot(url,binding,options)).toEqual(snapshot);}finally{await close(server);}});
test('connection refused then genuine Response readiness',async()=>{let calls=0;const transport:typeof fetch=async()=>{calls++;if(calls===1)throw new TypeError('fetch failed',{cause:Object.assign(new Error('refused'),{code:'ECONNREFUSED'})});return Response.json(fixture);};await expect(waitForSnapshot('http://127.0.0.1:41882',binding,{...options,transport})).resolves.toEqual(snapshot);expect(calls).toBe(2);});
for(const status of [404,503])test(`HTTP ${status} never ready; bounded and classified`,async()=>{let n=0;await expect(waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>{n++;return Response.json({}, {status});}})).rejects.toMatchObject({code:'HTTP_NOT_READY',status});expect(n).toBe(status===404?1:4);});
for(const value of [{ok:true},{...snapshot,discussionId:crypto.randomUUID()}])test('invalid or wrong snapshot fails contract immediately',async()=>{let n=0;await expect(waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>{n++;return Response.json(value);}})).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});expect(n).toBe(1);});
test('complete body timeout bounded even after headers',async()=>{const server=createServer((_q,r)=>{r.writeHead(200,{'Content-Type':'application/json'});r.flushHeaders();r.write(' ');});const url=await listen(server);const start=performance.now();try{await expect(waitForSnapshot(url,binding,{...options,maxAttempts:2})).rejects.toMatchObject({code:'REQUEST_TIMEOUT'});expect(performance.now()-start).toBeLessThan(1000);}finally{await close(server);}});
test('programming TypeError is original error, never hidden by retries',async()=>{const error=new TypeError('response.ok is not a function');let n=0;await expect(waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>{n++;throw error;}})).rejects.toBe(error);expect(n).toBe(1);});
test('cleanup idempotent concurrently, attempts all owned actions even if one fails',async()=>{const called:string[]=[];const cleanup=cleanupOnce([async()=>{called.push('own-front');throw Error('stop failed');},async()=>{called.push('own-back');}]);const results=await Promise.allSettled([cleanup(),cleanup()]);expect(called).toEqual(['own-front','own-back']);expect(results.map(r=>r.status)).toEqual(['rejected','rejected']);});
test('successful readiness does not run failure cleanup',async()=>{let failed=false;try{await waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>Response.json(fixture)});}catch{failed=true;}expect(failed).toBe(false);});
test('200 with non-JSON content type is not application readiness',async()=>{
 await expect(waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>new Response(JSON.stringify(fixture),{headers:{'Content-Type':'text/html'}})})).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
});
test('malformed JSON is contract failure, not startup timeout',async()=>{
 await expect(waitForSnapshot('http://127.0.0.1',binding,{...options,transport:async()=>new Response('{',{headers:{'Content-Type':'application/json'}})})).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
});
