import {fork,spawn,type ChildProcess} from 'node:child_process';
export interface OwnedChild {child:ChildProcess;exited:Promise<{code:number|null;signal:string|null}>;stop:()=>Promise<void>}
export function startOwned(script:string,args:string[],env:NodeJS.ProcessEnv,ipc=false):OwnedChild{
 const child=ipc?fork(script,args,{execArgv:[],env,stdio:['ignore','pipe','pipe','ipc']}):spawn(process.execPath,[script,...args],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
 const exited=new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});void exited.catch(()=>{});
 let stopping:Promise<void>|undefined;
 const stop=()=>stopping??=(async()=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  if(child.connected)child.send('shutdown',()=>{if(child.connected)child.disconnect();});else child.kill();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([exited,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_CHILD_STOP_TIMEOUT')),5000);})]);}
  catch(error){if(child.exitCode===null&&child.signalCode===null)child.kill();throw error;}
  finally{clearTimeout(timer);}
 })();
 return {child,exited,stop};
}
