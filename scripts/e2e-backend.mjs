// Only Playwright's explicitly supplied new temporary database is initialized here.
import { resolve, relative, isAbsolute } from 'node:path';
import { initializeConfiguredDatabase, openConfiguredDatabase } from '../dist/runtime.js';
import { createApp } from '../dist/http/app.js';
import { DraftService } from '../dist/domain/drafts.js';
import { SqliteDraftStore } from '../dist/db/sqlite-drafts.js';
import { LineupService } from '../dist/domain/lineup-service.js';
import { SqliteLineupStore } from '../dist/db/sqlite-lineup.js';
import { FakeRosterProvider } from '../dist/providers/fake-roster.js';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const file = process.env.DATABASE_PATH;
if (!file) throw new Error('E2E_DATABASE_REQUIRED');
const within = relative(resolve('.tmp/stage-4c'), resolve(file));
if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('E2E_DATABASE_OUTSIDE_SCOPE');
await initializeConfiguredDatabase(file);
// Test-only provider composition. No production route/config accepts these controls.
const calls=new Map();
const provider=new FakeRosterProvider([async(input,context)=>{
  const n=(calls.get(input.discussionId)??0)+1;calls.set(input.discussionId,n);
  const gate=/\[gate:([a-f0-9-]{36})\]/.exec(input.topic);
  if(gate&&n===1)while(!existsSync(resolve('.tmp/stage-4c/gates',gate[1])))await delay(30,undefined,{signal:context.signal});
  const mode=input.topic.includes('[retry]')&&n<=2?'transport':input.topic.includes('[regen-fail]')&&n>=2&&n<=3?'few':'normal';
  const raw=await new FakeRosterProvider([mode]).generateRoster(input,context);
  if(!input.topic.includes('[long]'))return raw;
  const value=JSON.parse(raw);
  for(const member of value.roles){member.name+='关于教育与技术的跨学科观察者'.repeat(2);member.profession='教育实践、社会研究和公共政策'.repeat(4);member.title='跨学科教育与科技研究项目负责人'.repeat(4);member.stance='需要结合实际课堂情境，兼顾教师的自主判断、学生差异及长期成本。'.repeat(5);}
  return JSON.stringify(value);
}]);
const db=openConfiguredDatabase(file),lineup=new LineupService(new SqliteLineupStore(db),provider);
lineup.recover();
const server=createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup).listen(Number(process.env.PORT),'127.0.0.1');
const close=()=>{server.close(()=>void lineup.close().then(()=>db.close()));server.closeAllConnections();};
process.once('SIGINT',close);process.once('SIGTERM',close);
