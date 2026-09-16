import {readFileSync,existsSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,basename,join} from 'node:path';
import {createServer} from 'node:net';
import {isObject,validateUuid} from '../../src/domain/input.js';
import {waitForSnapshot,cleanupOnce,type Binding} from './readiness.js';
import {startOwned,type OwnedChild} from './owned-child.js';
export interface Prepared extends Binding {runId:string;testOnly?:boolean}
export function readPrepared(root:string,local:boolean):Prepared{
 const raw:unknown=JSON.parse(readFileSync(join(root,'prepared.json'),'utf8'));
 if(!isObject(raw)||raw.lineupRevision!==1||local&&raw.testOnly!==true||!local&&raw.testOnly!==undefined)throw Error('INVALID_PREPARED_FIXTURE');
 const p:Prepared={discussionId:validateUuid(raw.discussionId),runId:validateUuid(raw.runId),generationId:validateUuid(raw.generationId),lineupRevision:1};
 if(local)p.testOnly=true;
 const auth=join(root,'authorization');
 if(existsSync(join(auth,'closed.json'))||existsSync(join(auth,'started.json'))||readdirSync(auth).some(f=>/^(ordinary|summary)-\d+\.json$/.test(f)))throw Error('AUTHORIZATION_CLOSED_OR_USED');
 return p;
}
async function portFree(port:number):Promise<void>{
 const probe=createServer();await new Promise<void>((resolveReady,reject)=>{probe.once('error',()=>reject(Error(`PORT_OCCUPIED_${port}`)));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolveReady()));});
}
async function localRoot(owned:OwnedChild):Promise<string>{
 return new Promise((resolveRoot,reject)=>{
  const timer=setTimeout(()=>finish(Error('LOCAL_PREPARATION_TIMEOUT')),15000);
  const finish=(error?:Error,root?:string)=>{clearTimeout(timer);owned.child.off('message',message);if(error)reject(error);else resolveRoot(root!);};
  const message=(value:unknown)=>{if(!isObject(value)||typeof value.localRoot!=='string')return;
   const root=resolve(value.localRoot),rel=relative(resolve('.tmp/stage-6b'),root);
   if(!rel||rel.startsWith('..')||isAbsolute(rel)){finish(Error('INVALID_TEST_DIRECTORY'));return;}finish(undefined,root);
  };
  owned.child.on('message',message);void owned.exited.then(()=>finish(Error('LOCAL_PREPARATION_EXITED')),()=>finish(Error('LOCAL_PREPARATION_FAILED')));
 });
}
/** One shared orchestration for local rehearsal and the separately authorized live entry. */
export async function launchStage6b(mode:'local'|'live'):Promise<void>{
 // No preparation/authorization creation here. The old closed live record fails before spawning or loading secrets.
 let root=resolve('.local/stage-6b-live'),prepared:Prepared|undefined;
 if(mode==='live')prepared=readPrepared(root,false);
 await portFree(41882);await portFree(41881);
 const output=resolve('evidence/stage-6b/startup-fix',`${mode}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(output,{recursive:true});
 const report:{mode:string;startedAt:string;steps:string[];processes:unknown[];error?:{name:string;message:string};finishedAt?:string;root?:string;uiEvidence?:string}={mode,startedAt:new Date().toISOString(),steps:[],processes:[]};
 const owned:OwnedChild[]=[];const cleanup=cleanupOnce([async()=>{const errors:unknown[]=[];for(const process of [...owned].reverse()){try{await process.stop();report.processes.push(await process.exited);}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'CHILD_CLEANUP_FAILED');}]);
 let interrupted=false;const assertActive=()=>{if(interrupted)throw Error('STARTUP_INTERRUPTED');};
 const interrupt=()=>{interrupted=true;void cleanup().catch(()=>{process.exitCode=1;});};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{
  const env:NodeJS.ProcessEnv={...process.env,DEEPSEEK_API_KEY:'',DISCUSSION_PROVIDER:'fake',ROSTER_PROVIDER:'fake'};
  const backend=startOwned(mode==='local'?'scripts/stage6b-local-backend.mjs':'dist/live-stage6b.js',[],env,true);owned.push(backend);
  if(mode==='local'){root=await localRoot(backend);prepared=readPrepared(root,true);}if(!prepared)throw Error('PREPARATION_MISSING');report.root=root;assertActive();
  const path=`/api/discussions/${prepared.discussionId}`;
  const initial=await waitForSnapshot('http://127.0.0.1:41882'+path,prepared);report.steps.push('backend snapshot validated');assertActive();
  const front=startOwned('node_modules/vite/bin/vite.js',['--config','web/vite.config.ts','--port','41881'],{...env,WEB_API_TARGET:'http://127.0.0.1:41882',VITE_DISCUSSION_DEMO:mode==='local'?'local-http':'live-short'});owned.push(front);
  const proxied=await waitForSnapshot('http://127.0.0.1:41881'+path,prepared);
  if(JSON.stringify(initial)!==JSON.stringify(proxied))throw Error('PROXY_SNAPSHOT_MISMATCH');report.steps.push('frontend proxy same snapshot validated');assertActive();
  const ui=startOwned('scripts/stage6b-live-ui.mjs',mode==='local'?['--local',root]:[],env);owned.push(ui);const result=await ui.exited;
  const uiEvidence=mode==='local'?'evidence/stage-6b/local-'+basename(root):'evidence/stage-6b/live';report.uiEvidence=uiEvidence;
  const uiRecord:unknown=JSON.parse(readFileSync(join(uiEvidence,'ui-result.json'),'utf8'));
  if(result.code!==0||!isObject(uiRecord)||uiRecord.outcome!=='normal_path')throw Error('UI_NOT_NORMAL_PATH_NO_RETRY');report.steps.push('browser short discussion + terminal refresh passed');
 }catch(error){report.error={name:error instanceof Error?error.name:'UnknownError',message:error instanceof Error?error.message:'UNKNOWN_STARTUP_ERROR'};throw error;}
 finally{try{await cleanup();}finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);report.finishedAt=new Date().toISOString();writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({evidence:join(output,'result.json'),steps:report.steps,error:report.error}));}}
}
