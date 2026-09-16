import {it,expect} from 'vitest';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,unlinkSync} from 'node:fs';
import {temporaryDatabase} from '../helpers/database.js';
import {initializeDatabase} from '../../src/db/database.js';
it('正式服务接受自有启动器shutdown并释放数据库owner',async()=>{const {path,db}=temporaryDatabase();initializeDatabase(db);db.close();const child=fork('dist/server.js',[],{execArgv:[],env:{...process.env,PORT:'41912',DATABASE_PATH:path,ROSTER_PROVIDER:'fake',DISCUSSION_PROVIDER:'fake',DEEPSEEK_API_KEY:''},stdio:['ignore','pipe','pipe','ipc']});const exited=once(child,'exit');try{await once(child.stdout!,'data');child.send('shutdown');const result=await Promise.race([exited,new Promise<null>(r=>{const t=setTimeout(()=>r(null),1500);void exited.then(()=>clearTimeout(t));})]);expect(result).not.toBeNull();expect(result?.[0]).toBe(0);expect(existsSync(path+'.owner')).toBe(false);}finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}if(existsSync(path+'.owner'))unlinkSync(path+'.owner');}});
