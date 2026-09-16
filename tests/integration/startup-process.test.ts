import {test,expect} from 'vitest';
import {createServer} from 'node:net';
import {startOwned} from '../../scripts/startup/owned-child.js';
import {cleanupOnce} from '../../scripts/startup/readiness.js';
test('actual owned child exits once; unrelated listening service remains',async()=>{
 const other=createServer();await new Promise<void>(r=>other.listen(0,'127.0.0.1',r));
 const owned=startOwned('tests/fixtures/startup/owned-child.cjs',[],process.env,true);
 try{await new Promise<void>(r=>owned.child.once('message',()=>r()));const cleanup=cleanupOnce([owned.stop]);await Promise.all([cleanup(),cleanup()]);expect(await owned.exited).toEqual({code:0,signal:null});expect(other.listening).toBe(true);}
 finally{if(owned.child.exitCode===null&&owned.child.signalCode===null){owned.child.kill();await owned.exited;}await new Promise<void>(r=>other.close(()=>r()));}
});
test('shared launcher refuses occupied port and preserves unrelated service',async()=>{
 const other=createServer();await new Promise<void>(r=>other.listen(41881,'127.0.0.1',r));
 try{const {launchStage6b}=await import('../../scripts/startup/launch.js');await expect(launchStage6b('local')).rejects.toThrow('PORT_OCCUPIED_41881');expect(other.listening).toBe(true);}
 finally{await new Promise<void>(r=>other.close(()=>r()));}
});
