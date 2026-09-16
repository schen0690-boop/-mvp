import {realpathSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
/** Conservative single-instance guard. Never clears another instance's stale file. */
export function acquireDatabaseOwnership(path:string):()=>void{
 const owner=realpathSync(path)+'.owner',token=JSON.stringify({pid:process.pid,token:randomUUID()});
 let fd:number;try{fd=openSync(owner,'wx');}catch{throw new Error('DATABASE_ALREADY_OWNED');}
 try{writeFileSync(fd,token);fsyncSync(fd);}finally{closeSync(fd);}
 let released=false;return ()=>{if(released)return;released=true;if(readFileSync(owner,'utf8')===token)unlinkSync(owner);};
}
