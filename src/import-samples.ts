import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {samples} from './sample-data.js';
import {DraftService} from './domain/drafts.js';
import {SqliteDraftStore} from './db/sqlite-drafts.js';
import {SqliteLineupStore} from './db/sqlite-lineup.js';
import {transaction} from './db/read-discussion.js';
import {parseRoster,enrichRoster} from './domain/lineup.js';
/** Offline maintenance only. No provider, automatic confirmation or runner. */
export function importSamples(db:DatabaseSync):string[]{
 const validated=samples.map(s=>({sample:s,members:enrichRoster(parseRoster(JSON.stringify({roles:s.roles}),s.expertCount))}));
 return transaction(db,()=>{
  const drafts=new DraftService(new SqliteDraftStore(db)),lineups=new SqliteLineupStore(db);
  return validated.map(({sample,members})=>{
   const result=drafts.create({requestId:sample.requestId,topic:sample.topic,expertCount:sample.expertCount});
   if(!result.replayed){const time=new Date().toISOString();const generation=lineups.begin(result.discussionId,{requestId:randomUUID(),expectedGenerationId:null},randomUUID(),time);if(!lineups.complete(result.discussionId,generation,members,time))throw Error('SAMPLE_NOT_SAVED');}
   return result.discussionId;
  });
 });
}
