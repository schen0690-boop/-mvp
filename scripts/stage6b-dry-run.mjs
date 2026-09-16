import {spawn,fork} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
const startedAt=new Date().toISOString(),backend=fork('scripts/stage6b-local-backend.mjs',[],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']}),stops=[];let front;
const ended=child=>new Promise(resolve=>child.once('exit',(code,signal)=>resolve({pid:child.pid,code,signal})));
const backEnd=ended(backend);backend.stderr.on('data',d=>process.stderr.write(d));backend.stdout.on('data',()=>{});
try{
 const root=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('LOCAL_START_TIMEOUT')),15000);backend.once('message',m=>{clearTimeout(timer);resolve(m.localRoot);});backend.once('exit',()=>{clearTimeout(timer);reject(Error('LOCAL_START_FAILED'));});});
 const prepared=JSON.parse(readFileSync(root+'/prepared.json','utf8')),base='http://127.0.0.1:41882';const cases=[];
 for(const path of ['/api/discussions',`/api/discussions/${prepared.discussionId}/lineup`,`/api/discussions/${crypto.randomUUID()}/start`]){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});cases.push({path,status:r.status});assert.equal(r.status,409);}
 const invalid=await fetch(base+`/api/discussions/${prepared.discussionId}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),generationId:prepared.generationId,lineupRevision:1,expertTurns:99})});assert.equal(invalid.status,400);assert(!existsSync(root+'/authorization/started.json'));
 front=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','web/vite.config.ts','--port','41881'],{windowsHide:true,env:{...process.env,WEB_API_TARGET:base,VITE_DISCUSSION_DEMO:'local-http'},stdio:['ignore','pipe','pipe']});const frontEnd=ended(front);stops.push(frontEnd);front.stdout.on('data',()=>{});front.stderr.on('data',d=>process.stderr.write(d));
 const deadline=Date.now()+15000;while(true){try{if((await fetch('http://127.0.0.1:41881')).ok)break;}catch{}if(Date.now()>deadline)throw Error('FRONT_NOT_READY');await delay(100);}
 const ui=spawn(process.execPath,['scripts/stage6b-live-ui.mjs','--local',root],{windowsHide:true,stdio:['ignore','pipe','pipe']});ui.stdout.on('data',d=>process.stdout.write(d));ui.stderr.on('data',d=>process.stderr.write(d));const result=await ended(ui);assert.equal(result.code,0);
 const out='evidence/stage-6b/local-'+basename(root),record=JSON.parse(readFileSync(out+'/ui-result.json','utf8'));assert.equal(record.outcome,'normal_path');
 writeFileSync('evidence/stage-6b/dry-run.json',JSON.stringify({startedAt,endedAt:new Date().toISOString(),officialRequests:0,root,evidence:out,writeRestrictions:cases,clientLimitsRejected:invalid.status,uiExitCode:result.code,record},null,2)+'\n');
}catch(error){console.error(error instanceof Error?error.message:'LOCAL_DRY_RUN_FAILED');process.exitCode=1;}
finally{front?.kill();backend.send('shutdown');stops.push(backEnd);console.log(JSON.stringify({localProcesses:await Promise.all(stops)}));}
