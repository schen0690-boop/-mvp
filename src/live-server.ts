// Explicit, one-sample acceptance entry. Never imported by normal tests or the Fake server.
import { openSync,closeSync,unlinkSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { loadBackendConfig } from './backend-config.js';
import { DeepSeekRosterProvider } from './providers/deepseek.js';
import { LiveAuthorization } from './live/authorization.js';
import { GuardedRosterProvider } from './live/guarded-roster.js';
import { initializeConfiguredDatabase,openConfiguredDatabase } from './runtime.js';
import { SqliteLineupStore } from './db/sqlite-lineup.js';
import { SqliteDraftStore } from './db/sqlite-drafts.js';
import { LineupService } from './domain/lineup-service.js';
import { DraftService } from './domain/drafts.js';
import { createApp } from './http/app.js';
try {
  const config=loadBackendConfig();if(config.provider!=='deepseek')throw new Error();
  const root=resolve('.local/stage-4d-live'),authorization=new LiveAuthorization(join(root,'authorization'));
  if(authorization.closed)throw new Error();
  const lock=join(root,'server.lock'),fd=openSync(lock,'wx');
  const release=()=>{closeSync(fd);unlinkSync(lock);};
  try {
    const file=join(root,'discussions.sqlite');if(!existsSync(file))await initializeConfiguredDatabase(file);
    const db=openConfiguredDatabase(file);
    const provider=new DeepSeekRosterProvider(config.deepseek,fetch,metric=>authorization.record(authorization.count,metric));
    const lineup=new LineupService(new SqliteLineupStore(db),new GuardedRosterProvider(provider,authorization),{capacity:1});
    try{lineup.recover();}catch{db.close();throw new Error();}
    const server=createApp(new DraftService(new SqliteDraftStore(db)),undefined,lineup).listen(41852,'127.0.0.1',()=>{
      console.log('DeepSeek受限联调后端：http://127.0.0.1:41852；唯一指定样本，累计最多2次请求。');
    });
    let stopped=false;
    const stop=()=>{if(stopped)return;stopped=true;clearTimeout(lifetime);
      try{authorization.close('shutdown');}catch{process.exitCode=1;}
      server.close(()=>{void lineup.close().finally(()=>{db.close();release();});});server.closeAllConnections();
    };
    const lifetime=setTimeout(stop,10*60*1000);
    server.once('error',()=>{console.error('受限联调监听失败。');process.exitCode=1;stop();});
    process.once('SIGINT',stop);process.once('SIGTERM',stop);process.on('message',message=>{if(message==='shutdown')stop();});
  }catch{release();throw new Error();}
}catch{console.error('受限联调未启动：请检查本地配置、端口或已有授权记录；不得删除计数文件重试。');process.exitCode=1;}
