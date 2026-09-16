import {randomUUID} from 'node:crypto';
import {temporaryDatabase} from './database.js';
import {initializeDatabase} from '../../src/db/database.js';
import {DraftService} from '../../src/domain/drafts.js';
import {SqliteDraftStore} from '../../src/db/sqlite-drafts.js';
import {SqliteLineupStore} from '../../src/db/sqlite-lineup.js';
import {LineupService} from '../../src/domain/lineup-service.js';
import {FakeRosterProvider} from '../../src/providers/fake-roster.js';
import {SqliteDiscussionStore} from '../../src/db/sqlite-discussion.js';
export async function discussionFixture(expertCount=4){
 const {db,path}=temporaryDatabase();initializeDatabase(db);const drafts=new DraftService(new SqliteDraftStore(db));
 const id=drafts.create({topic:'AI 如何改善教育？',expertCount,requestId:randomUUID()}).discussionId;
 const lineup=new LineupService(new SqliteLineupStore(db),new FakeRosterProvider());
 const generation=lineup.generate(id,{requestId:randomUUID(),expectedGenerationId:null});await lineup.idle();
 const confirmed=lineup.confirm(id,{generationId:generation.generationId,lineupRevision:generation.generationVersion}).snapshot;
 return {db,path,drafts,lineup,id,confirmed,store:new SqliteDiscussionStore(db),input:{requestId:randomUUID(),generationId:generation.generationId,lineupRevision:generation.generationVersion}};
}
