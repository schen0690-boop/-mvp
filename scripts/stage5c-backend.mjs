// Test-only composition: no production endpoint accepts failure modes or gates.
import {resolve,relative,isAbsolute,join} from 'node:path';
import {existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
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
import {FakeDiscussionProvider} from '../dist/providers/fake-discussion.js';
import {ProviderError} from '../dist/providers/roster.js';
import {CallLimiter} from '../dist/providers/call-limiter.js';
import {LimitedRosterProvider} from '../dist/providers/limited-roster.js';
import {acquireDatabaseOwnership} from '../dist/db/ownership.js';
const file=process.env.DATABASE_PATH;if(!file)throw Error('TEST_DATABASE_REQUIRED');
const inside=relative(resolve('.tmp/stage-5c'),resolve(file));if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('TEST_DATABASE_OUTSIDE_SCOPE');
await initializeConfiguredDatabase(file);const release=acquireDatabaseOwnership(file),db=openConfiguredDatabase(file),limiter=new CallLimiter(),calls=new Map();
globalThis.fetch=async()=>{throw Error('EXTERNAL_NETWORK_FORBIDDEN_IN_FAKE_TEST_SERVER');};
const roster=new FakeRosterProvider([async(input,context)=>{
 const n=(calls.get(input.discussionId)??0)+1;calls.set(input.discussionId,n);const gate=/\[gate:([a-f0-9-]{36})\]/.exec(input.topic);
 if(gate&&n===1)while(!existsSync(resolve('.tmp/stage-4d/gates',gate[1])))await delay(30,undefined,{signal:context.signal});
 const mode=input.topic.includes('[retry]')&&n<=2?'transport':input.topic.includes('[regen-fail]')&&n>=2&&n<=3?'few':'normal';
 const raw=await new FakeRosterProvider([mode]).generateRoster(input,context);if(!input.topic.includes('[long]'))return raw;
 const value=JSON.parse(raw);for(const m of value.roles){m.name+='关于教育与技术的跨学科观察者'.repeat(2);m.profession='教育实践、社会研究和公共政策'.repeat(4);m.title='跨学科教育与科技研究项目负责人'.repeat(4);m.stance='需要结合实际课堂情境，兼顾教师的自主判断、学生差异及长期成本。'.repeat(5);}return JSON.stringify(value);
}]);
const plain=new FakeDiscussionProvider();
async function gate(input,context,phase){const token=/\[run:([a-f0-9-]{36})\]/.exec(input.topic)?.[1];if(!token)return;
 while(!existsSync(join('.tmp/stage-5c/gates',`${token}-${phase}`)))await delay(20,undefined,{signal:context.signal});}
const discussionProvider=new FakeDiscussionProvider({
 async generateUtterance(input,context){
  if(input.utterances.length>=3)await gate(input,context,'continue');
  if(input.topic.includes('[fatal]')&&input.utterances.length>=3)throw new ProviderError('configuration');
  const result=await plain.generateUtterance(input,context);
  if(input.topic.includes('[text]'))result.sentences=['面对教育资源、教师培训和数据保护的实际限制，我们需要从已经公开的意见出发，逐步验证课堂效果，并让不同背景的学生都能参与反馈。','建议先进行小范围、可撤回的试点，记录学习变化与教师负担，再根据证据调整实施方式，而不是仅凭技术新颖程度作决定。'];
  return result;
 },
 async extractSynthesis(input,context){const result=await plain.extractSynthesis(input,context);if(input.topic.includes('[text]'))for(const item of result.items)item.text='现有发言支持先进行小范围试点，并共同关注教育资源差异、教师自主判断、学生反馈及长期维护成本；这些局部一致仍需要后续实际证据检验。';
  if(input.topic.includes('[disagree]')&&result.items.length){const ids=result.items[0].evidenceUtteranceIds.slice(0,2);result.items=[{kind:'disagreement',text:'Fake场景：实施节奏仍存在分歧，需要进一步讨论教育公平与试点范围。',evidenceUtteranceIds:ids,positions:[{text:'先验证教师支持方案再逐步扩大范围。',evidenceUtteranceIds:[ids[0]]},{text:'先补齐资源不足学校的实施条件。',evidenceUtteranceIds:[ids[1]]}]}];}return result;},
 async summarize(input,context){if(input.topic.includes('[summary-gate]'))await gate(input,context,'summary');if(input.topic.includes('[summary-fail]'))throw new ProviderError('transport');return plain.summarize(input,context);}
});
const lineup=new LineupService(new SqliteLineupStore(db),new LimitedRosterProvider(roster,limiter));
const discussion=new DiscussionService(new SqliteDiscussionStore(db),discussionProvider,limiter);lineup.recover();discussion.recover();
const server=createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup,discussion,new SqliteEventSource(db)).listen(Number(process.env.PORT),'127.0.0.1');
let closing=false;const close=()=>{if(closing)return;closing=true;server.close(()=>{void Promise.all([lineup.close(),discussion.close()]).finally(()=>{db.close();release();});});server.closeAllConnections();};
process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',message=>{if(message==='shutdown')close();});
