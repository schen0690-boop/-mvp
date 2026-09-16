import {acceptancePaths} from './live/acceptance-paths.js';
// Explicit one-time preparation. No model transport is constructed here.
import {existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {projectRoot,stage6bSettings,presetRoster} from './live/stage6b-settings.js';
import {DiscussionAuthorization,writeOnce} from './live/discussion-authorization.js';
import {initializeConfiguredDatabase,openConfiguredDatabase} from './runtime.js';
import {DraftService} from './domain/drafts.js';
import {SqliteDraftStore} from './db/sqlite-drafts.js';
import {SqliteLineupStore} from './db/sqlite-lineup.js';
import {LineupService} from './domain/lineup-service.js';
try{
 const profile=acceptancePaths(process.argv.slice(2)),stage6bRoot=join(projectRoot,profile.root),stage6bAnchor=join(projectRoot,profile.anchor);
 if(existsSync(stage6bAnchor)||existsSync(stage6bRoot))throw Error('ALREADY_PREPARED');
 const codeRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim();
 const authorizationId=randomUUID(),runId=randomUUID(),database=join(stage6bRoot,'discussions.sqlite');mkdirSync(dirname(stage6bAnchor),{recursive:true});
 writeOnce(stage6bAnchor,{authorizationId,runId,database,codeRevision,settings:stage6bSettings,preparedAt:new Date().toISOString()});
 await initializeConfiguredDatabase(database);const db=openConfiguredDatabase(database);
 try{
  const drafts=new DraftService(new SqliteDraftStore(db)),id=drafts.create({topic:stage6bSettings.topic,expertCount:2,requestId:randomUUID()}).discussionId;
  const lineup=new LineupService(new SqliteLineupStore(db),{generateRoster:async()=>JSON.stringify(presetRoster)});
  const generation=lineup.generate(id,{requestId:randomUUID(),expectedGenerationId:null});await lineup.idle();
  const confirmed=lineup.confirm(id,{generationId:generation.generationId,lineupRevision:generation.generationVersion}).snapshot;
  const binding={authorizationId,discussionId:id,runId,generationId:generation.generationId,lineupRevision:generation.generationVersion};new DiscussionAuthorization(join(stage6bRoot,'authorization'),binding);
  writeOnce(join(stage6bRoot,'prepared.json'),{codeRevision,...binding,roles:confirmed.roles,settings:stage6bSettings,source:'本地固定虚构阵容，非模型生成'});
  await lineup.close();console.log(JSON.stringify({prepared:true,discussionId:id,runId,status:confirmed.status,roles:confirmed.roles,officialRequests:0}));
 }finally{db.close();}
}catch{console.error('6B准备未完成或已有记录：禁止删除锚点/目录、换库或重置；仅核对现有记录。');process.exitCode=1;}
