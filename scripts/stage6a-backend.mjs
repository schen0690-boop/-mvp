// Local-only integration composition. No private config, authorization or live database is read.
import {resolve,relative,isAbsolute,join} from 'node:path';
import {existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {startDiscussionStub} from './lib/discussion-stub.mjs';
import {initializeConfiguredDatabase,openConfiguredDatabase} from '../dist/runtime.js';
import {createApp} from '../dist/http/app.js';
import {DraftService} from '../dist/domain/drafts.js';
import {SqliteDraftStore} from '../dist/db/sqlite-drafts.js';
import {SqliteLineupStore} from '../dist/db/sqlite-lineup.js';
import {SqliteDiscussionStore} from '../dist/db/sqlite-discussion.js';
import {SqliteEventSource} from '../dist/db/public-events.js';
import {LineupService} from '../dist/domain/lineup-service.js';
import {DiscussionService} from '../dist/domain/discussion-service.js';
import {FakeRosterProvider} from '../dist/providers/fake-roster.js';
import {createDiscussionProvider,readDiscussionConfig} from '../dist/providers/discussion-config.js';
import {CallLimiter} from '../dist/providers/call-limiter.js';
import {acquireDatabaseOwnership} from '../dist/db/ownership.js';
const file=process.env.DATABASE_PATH;if(!file)throw Error('TEST_DATABASE_REQUIRED');
const inside=relative(resolve('.tmp/stage-6a'),resolve(file));if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('TEST_DATABASE_OUTSIDE_SCOPE');
const stub=await startDiscussionStub(async(task,response)=>{
 const token=/\[local:([a-f0-9-]{36})\]/.exec(task.input.topic)?.[1];
 if(task.operation==='generateUtterance'&&task.input.utterances.length>=3&&token){
  while(!existsSync(join('.tmp/stage-6a/gates',token))&&!response.destroyed)await delay(20);
  if(response.destroyed)return true;
 }
 if(task.operation==='summarize'&&task.input.topic.includes('[summary-fail]')){response.statusCode=503;response.end('LOCAL_FAILURE');return true;}return false;
});
globalThis.fetch=async()=>{throw Error('NON_LOCAL_NETWORK_FORBIDDEN');};
await initializeConfiguredDatabase(file);const release=acquireDatabaseOwnership(file),db=openConfiguredDatabase(file),limiter=new CallLimiter();
const lineup=new LineupService(new SqliteLineupStore(db),new FakeRosterProvider());
const config=readDiscussionConfig({DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'local-stub-credential'});
const discussion=new DiscussionService(new SqliteDiscussionStore(db),createDiscussionProvider(config,stub.transport),limiter);lineup.recover();discussion.recover();
const server=createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup,discussion,new SqliteEventSource(db)).listen(Number(process.env.PORT),'127.0.0.1');
let closing=false;const close=()=>{if(closing)return;closing=true;server.close(()=>{void Promise.all([lineup.close(),discussion.close()]).finally(async()=>{await stub.close();db.close();release();});});server.closeAllConnections();};
process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',m=>{if(m==='shutdown')close();});
