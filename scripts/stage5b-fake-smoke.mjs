// One complete Fake trace through the ordinary compiled server, using an isolated new database.
import assert from 'node:assert/strict';
import {fork,spawnSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const destination=process.argv.includes('--final')?'evidence/stage-5b/fake-trace-final.json':'evidence/stage-5b/fake-trace.json';
assert.equal(existsSync(destination),false,'Preserve existing trace evidence');
const root=resolve('.tmp/stage-5b');mkdirSync(root,{recursive:true});
const file=join(mkdtempSync(join(root,'http-')),'fake.sqlite');
const reservation=createServer().listen(0,'127.0.0.1');await once(reservation,'listening');
const address=reservation.address();assert(address&&typeof address==='object');const port=address.port;
await new Promise(r=>reservation.close(r));
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
env.DATABASE_PATH=file;env.PORT=String(port);
const init=spawnSync(process.execPath,['dist/init-db.js'],{env,encoding:'utf8',windowsHide:true});assert.equal(init.status,0,'Initialization must succeed');
const base='http://127.0.0.1:'+port+'/api/discussions',runs=[];
async function server(){
 const child=fork(resolve('scripts/smoke-child.mjs'),[],{env,silent:true,windowsHide:true});const exit=once(child,'exit');
 await new Promise((resolveReady,reject)=>{
  let output='';const timer=setTimeout(()=>reject(new Error('START_TIMEOUT')),10000);
  child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('http://127.0.0.1:'+port)){clearTimeout(timer);resolveReady();}});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('EARLY_EXIT_'+code));});
 }).catch(error=>{child.kill();throw error;});
 return async()=>{const timer=setTimeout(()=>child.kill(),10000);child.send('shutdown');const [code,signal]=await exit;clearTimeout(timer);runs.push({pid:child.pid,code,signal});assert.equal(code,0);assert.equal(existsSync(file+'.owner'),false);};
}
const post=async(path,body,expected)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});assert.equal(response.status,expected);return response.json();};
async function get(id){const r=await fetch(base+'/'+id,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();}
async function until(id,done){const deadline=performance.now()+15000;let snapshot;do{snapshot=await get(id);if(done(snapshot))return snapshot;}while(performance.now()<deadline);throw new Error('BUSINESS_STATE_NOT_REACHED');}
let completed,accepted,id,confirmed;const time=new Date().toISOString();
const stop=await server();
try{
 const created=await post('',{topic:'AI 如何改善教育？',expertCount:4,requestId:randomUUID()},201);id=created.discussionId;
 await post('/'+id+'/lineup',{requestId:randomUUID(),expectedGenerationId:null},202);
 const ready=await until(id,s=>s.status!=='generating_lineup');assert.equal(ready.status,'awaiting_confirmation');
 confirmed=(await post('/'+id+'/lineup/confirm',{generationId:ready.lineupGeneration.generationId,lineupRevision:ready.lineupRevision},200)).snapshot;
 const input={requestId:randomUUID(),generationId:ready.lineupGeneration.generationId,lineupRevision:ready.lineupRevision};
 accepted=await post('/'+id+'/start',input,202);assert.equal(accepted.snapshot.status,'running');
 completed=await until(id,s=>s.status==='completed'||s.status==='failed');
 assert.equal(completed.status,'completed');assert.equal(completed.stopReason,'turn_limit');assert.equal(completed.utterances.length,13);assert.equal(completed.summary.status,'ready');assert.equal(completed.summary.sourceTranscriptVersion,13);assert.equal(completed.confirmedAt,confirmed.confirmedAt);
 assert.equal((await post('/'+id+'/start',input,200)).runId,accepted.runId);await post('/'+id+'/stop',{},200);
}finally{await stop();}
const stopAgain=await server();try{assert.deepEqual(await get(id),completed);}finally{await stopAgain();}
await assert.rejects(fetch(base,{signal:AbortSignal.timeout(1000)}));
const db=new DatabaseSync(file,{readOnly:true});
let events,counters,versions;
try{
 versions=db.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map(r=>r.id);assert.deepEqual(versions,[1,2,3]);
 counters=db.prepare('SELECT expert_turn_count,calls_used,call_limit,summary_calls_used FROM discussions WHERE id=?').get(id);
 events=db.prepare("SELECT event_id,data_version,type,payload FROM public_events WHERE discussion_id=? AND type IN ('discussion.status_changed','utterance.created','synthesis.updated','summary.ready') ORDER BY event_id").all(id).map(r=>({eventId:r.event_id,dataVersion:r.data_version,type:r.type,payload:JSON.parse(r.payload)}));
 assert(events.some(e=>e.type==='synthesis.updated'&&e.payload.synthesis.sourceTranscriptVersion<13));assert.equal(counters.summary_calls_used,1);
}finally{db.close();}
const trace={label:'FAKE ONLY — 非真实模型质量证据',executedAt:time,codeRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),discussionId:id,runId:accepted.runId,migrationVersions:versions,counters,events,finalSnapshot:completed,processes:runs,listenerClosed:true,ownershipReleased:true,databaseScope:'.tmp/stage-5b/http-*'};
mkdirSync('evidence/stage-5b',{recursive:true});
writeFileSync(destination,JSON.stringify(trace,null,2)+'\n');
console.log(JSON.stringify({evidence:destination,discussionId:id,runId:accepted.runId,status:completed.status,utterances:completed.utterances.length,counters,processes:runs,listenerClosed:true,ownershipReleased:true}));
