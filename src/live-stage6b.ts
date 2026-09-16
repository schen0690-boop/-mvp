// Explicit acceptance entry only. No automatic initialization or alternate database is allowed.
import express from 'express';
import {readFileSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {stage6bAnchor,stage6bRoot,projectRoot,stage6bSettings} from './live/stage6b-settings.js';
import {loadStage6bConfig} from './live/stage6b-config.js';
import {DiscussionAuthorization} from './live/discussion-authorization.js';
import {GuardedDiscussionProvider} from './live/guarded-discussion.js';
import {openConfiguredDatabase} from './runtime.js';
import {acquireDatabaseOwnership} from './db/ownership.js';
import {SqliteDiscussionStore} from './db/sqlite-discussion.js';
import {SqliteDraftStore} from './db/sqlite-drafts.js';
import {SqliteEventSource} from './db/public-events.js';
import {DraftService} from './domain/drafts.js';
import {DiscussionService} from './domain/discussion-service.js';
import {createApp} from './http/app.js';
import {restrictStage6bWrites} from './live/stage6b-http.js';
try{
 const file=join(stage6bRoot,'discussions.sqlite'),dir=join(stage6bRoot,'authorization');
 if(!existsSync(file)||!existsSync(join(dir,'manifest.json')))throw Error();
 const prepared=JSON.parse(readFileSync(join(stage6bRoot,'prepared.json'),'utf8')),anchor=JSON.parse(readFileSync(stage6bAnchor,'utf8'));
 if(anchor.authorizationId!==prepared.authorizationId||anchor.runId!==prepared.runId||anchor.database!==file||JSON.stringify(anchor.settings)!==JSON.stringify(stage6bSettings)||anchor.codeRevision!==execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim())throw Error();
 const auth=new DiscussionAuthorization(dir,{authorizationId:prepared.authorizationId,discussionId:prepared.discussionId,runId:prepared.runId,generationId:prepared.generationId,lineupRevision:prepared.lineupRevision});
 const config=loadStage6bConfig(),lock=join(stage6bRoot,'server.lock'),fd=openSync(lock,'wx');
 let releaseDb:(()=>void)|undefined;let db:ReturnType<typeof openConfiguredDatabase>|undefined;
 try{
  releaseDb=acquireDatabaseOwnership(file);db=openConfiguredDatabase(file);
  const store=new SqliteDiscussionStore(db,{discussionId:auth.binding.discussionId,runId:auth.binding.runId,expertTurns:2,runDurationMs:120000,beforeStart:()=>auth.claim()});
  const provider=new GuardedDiscussionProvider(auth,config,fetch,()=>store.state(auth.binding.discussionId));const service=new DiscussionService(store,provider);
  if(auth.started){auth.close('interrupted');service.recover();}
  const app=express();app.use(restrictStage6bWrites(auth));app.use(createApp(new DraftService(new SqliteDraftStore(db)),undefined,undefined,service,new SqliteEventSource(db)));
  const server=app.listen(41882,'127.0.0.1',()=>console.log(JSON.stringify({provider:'deepseek',port:41882,discussionId:auth.binding.discussionId,runId:auth.binding.runId,counts:auth.counts,closed:auth.closed,settings:stage6bSettings,key:'密钥已配置'})));
  let closing=false;const stop=()=>{if(closing)return;closing=true;clearInterval(watch);clearTimeout(lifetime);auth.close('shutdown');server.closeAllConnections();server.close(()=>{void service.close().finally(()=>{db!.close();releaseDb!();closeSync(fd);unlinkSync(lock);});});};
  const watch=setInterval(()=>{try{const s=store.state(auth.binding.discussionId);if(s&&['completed','failed'].includes(s.snapshot.status))auth.close('terminal');}catch{auth.close('fatal');void service.close();}},100);
  const lifetime=setTimeout(stop,10*60*1000);server.once('error',()=>{process.exitCode=1;stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);process.on('message',m=>{if(m==='shutdown')stop();});
 }catch{db?.close();releaseDb?.();closeSync(fd);unlinkSync(lock);throw Error();}
}catch{console.error('6B受限服务未启动：配置、源码版本、独立记录或占用校验失败；不重置记录。');process.exitCode=1;}
