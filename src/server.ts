import { openConfiguredDatabase } from './runtime.js';
import { DraftService } from './domain/drafts.js';
import { SqliteDraftStore } from './db/sqlite-drafts.js';
import { createApp } from './http/app.js';
import { LineupService } from './domain/lineup-service.js';
import { SqliteLineupStore } from './db/sqlite-lineup.js';
import {selectProviders} from './app-providers.js';
import {DiscussionService} from './domain/discussion-service.js';
import {SqliteDiscussionStore} from './db/sqlite-discussion.js';

import {CallLimiter} from './providers/call-limiter.js';
import {LimitedRosterProvider} from './providers/limited-roster.js';
import {acquireDatabaseOwnership} from './db/ownership.js';
import {SqliteEventSource} from './db/public-events.js';

let release:()=>void=()=>{};
try {
  const args=process.argv.slice(2);if(args.some(a=>a!=='--allow-real-models'))throw Error('INVALID_OPTION');
  const providers=selectProviders(process.env,args.includes('--allow-real-models'));
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
  release=acquireDatabaseOwnership(process.env.DATABASE_PATH??'data/discussions.sqlite');
  const db = openConfiguredDatabase(),limiter=new CallLimiter();
  const lineup=new LineupService(new SqliteLineupStore(db),new LimitedRosterProvider(providers.roster,limiter),{diagnose:event=>console.error(event)});
  const discussion=new DiscussionService(new SqliteDiscussionStore(db),providers.discussion,limiter);
  try { lineup.recover();discussion.recover(); } catch(error) { db.close();throw error; }
  const server = createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup,discussion,new SqliteEventSource(db),providers.publicConfig).listen(port, '127.0.0.1', () => {
    console.log(`本地服务已启动：http://127.0.0.1:${port}（阵容=${providers.publicConfig.rosterProvider}；讨论=${providers.publicConfig.discussionProvider}）`);
  });
  let stopping = false;
  const cleanup=async()=>{if(stopping)return;stopping=true;try{await Promise.all([lineup.close(),discussion.close()]);}finally{db.close();release();}};
  server.once('error', () => {
    void cleanup();
    console.error('服务监听失败，请检查本机端口是否可用。');
    process.exitCode = 1;
  });
  const close = () => {
    server.close(() => { void cleanup(); });
    server.closeAllConnections();
  };
  process.once('message', message=>{if(message==='shutdown'){close();if(process.connected)process.disconnect();}});
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch {
  release();
  console.error('服务启动失败，请检查本地配置与运行环境。');
  process.exitCode = 1;
}
