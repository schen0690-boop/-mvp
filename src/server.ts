import { openConfiguredDatabase } from './runtime.js';
import { DraftService } from './domain/drafts.js';
import { SqliteDraftStore } from './db/sqlite-drafts.js';
import { createApp } from './http/app.js';
import { LineupService } from './domain/lineup-service.js';
import { SqliteLineupStore } from './db/sqlite-lineup.js';
import { FakeRosterProvider } from './providers/fake-roster.js';

try {
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
  const db = openConfiguredDatabase();
  const lineup=new LineupService(new SqliteLineupStore(db),new FakeRosterProvider(),{diagnose:event=>console.error(event)});
  try { lineup.recover(); } catch(error) { db.close();throw error; }
  const server = createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup).listen(port, '127.0.0.1', () => {
    console.log(`本地服务已启动：http://127.0.0.1:${port}（阵容使用Fake Provider，非真实AI）`);
  });
  server.once('error', () => {
    db.close();
    console.error('服务监听失败，请检查本机端口是否可用。');
    process.exitCode = 1;
  });
  let stopping = false;
  const close = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void lineup.close().then(()=>db.close()); });
    server.closeAllConnections();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch {
  console.error('服务启动失败，请检查本地配置与运行环境。');
  process.exitCode = 1;
}
