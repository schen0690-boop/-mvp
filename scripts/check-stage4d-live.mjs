// Read-only post-run verification. Does not load credentials or import the live server.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { DraftService } from '../dist/domain/drafts.js';
import { SqliteDraftStore } from '../dist/db/sqlite-drafts.js';
const out='evidence/stage-4d-b',root='.local/stage-4d-live';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const result=read(`${out}/ui-result.json`),binding=read(`${root}/authorization/binding.json`),closed=read(`${root}/authorization/closed.json`);
assert.equal(result.outcome,'single_sample_passed');assert.equal(result.browserClosed,true);
assert.deepEqual(binding,{discussionId:result.discussionId,generationId:result.generationId});assert.equal(closed.reason,'valid_result');
assert(!existsSync(`${root}/authorization/request-2.json`));assert(!existsSync(`${root}/server.lock`));
const request=read(`${root}/authorization/request-1.json`),metric=read(`${root}/authorization/result-1.json`);
assert.equal(request.attempt,1);assert.equal(request.discussionId,binding.discussionId);assert.equal(request.generationId,binding.generationId);
assert.equal(metric.httpStatus,200);assert.equal(metric.outcome,'content_received');assert.equal(metric.finishReason,'stop');
const confirmed=read(`${out}/confirmed.json`),refreshed=read(`${out}/refreshed.json`);assert.deepEqual(refreshed,confirmed);
const db=new DatabaseSync(`${root}/discussions.sqlite`,{readOnly:true});let snapshot,migrations,eventCount;
try {
  snapshot=new DraftService(new SqliteDraftStore(db)).get(binding.discussionId);
  assert.equal(snapshot.status,'lineup_confirmed');assert.equal(snapshot.confirmedLineupRevision,1);assert.equal(snapshot.lineupRevision,1);
  assert.deepEqual(snapshot.roles,confirmed.roles);assert.deepEqual(snapshot.lineupGeneration,confirmed.lineupGeneration);
  assert.equal(snapshot.version,4);assert.equal(snapshot.lastEventId,4);assert.deepEqual(snapshot.utterances,[]);assert.equal(snapshot.synthesis,null);
  assert.equal(new DraftService(new SqliteDraftStore(db)).list('all').items.length,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  migrations=db.prepare('SELECT id,name FROM schema_migrations ORDER BY id').all();assert.deepEqual(migrations.map(m=>m.id),[1,2]);
  eventCount=db.prepare('SELECT count(*) AS count FROM public_events WHERE discussion_id = ?').get(binding.discussionId).count;assert.equal(eventCount,4);
}finally{db.close();}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('check-ignore','.env.backend.local'),'.env.backend.local');assert.equal(git('ls-files','.env.backend.local'),'');
assert.equal(git('diff','0a39fada64ee118e26278d557e03097c7329359b','--name-only','--','src','web','tests','package.json','package-lock.json'),'');
const archive=readFileSync('docs/sources/development-prompts.md');
const old=execFileSync('git',['show','0a39fada64ee118e26278d557e03097c7329359b:docs/sources/development-prompts.md']);
// Git normalizes CRLF; compare text after line-ending normalization, retaining all original characters.
assert(archive.toString('utf8').replace(/\r\n/g,'\n').startsWith(old.toString('utf8').replace(/\r\n/g,'\n')));
const evidence={verifiedAt:new Date().toISOString(),discussionId:binding.discussionId,generationId:binding.generationId,lineupRevision:1,confirmedLineupRevision:1,status:snapshot.status,version:4,lastEventId:4,migrations,eventCount,readOnlyDatabaseReopen:true,databaseIntegrity:'ok',budgetReservations:1,evidencedRequests:1,successfulResponses:1,unusedAuthorizationClosed:true,closed:{reason:closed.reason,closedAt:closed.closedAt},request:{attempt:1,reservedAt:request.reservedAt,requestedModel:request.requestedModel},response:{attempt:metric.attempt,httpStatus:metric.httpStatus,elapsedMs:metric.elapsedMs,outcome:metric.outcome,finishReason:metric.finishReason,responseModel:metric.responseModel,requestId:metric.requestId,usage:metric.usage},productionSourcesUnchanged:true,privateConfigIgnoredUntracked:true,historicalPromptPrefixPreserved:true,uiScriptSha256:createHash('sha256').update(readFileSync('scripts/stage4d-live-ui.mjs')).digest('hex')};
writeFileSync(`${out}/verified-live.json`,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(evidence,null,2));
