import {ProviderError} from './roster.js';
interface Waiting {id:string;launch:()=>void}
export class CallLimiter {
 private readonly queue:Waiting[]=[];
 private readonly counts=new Map<string,number>();
 private count=0;
 private lastId='';
 get active():number{return this.count;}
 get pending():number{return this.queue.length;}
 run<T>(id:string,signal:AbortSignal,deadline:number,operation:()=>Promise<T>):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
   let started=false,done=false;let timer:ReturnType<typeof setTimeout>|undefined;
   const finish=(ok:boolean,value:unknown)=>{
    if(done)return;done=true;if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);
    const index=this.queue.indexOf(entry);if(index>=0)this.queue.splice(index,1);
    if(started){this.count--;this.counts.set(id,(this.counts.get(id)??1)-1);}
    if(!ok)reject(value);this.pump();
   };
   const abort=()=>finish(false,signal.reason instanceof ProviderError?signal.reason:new ProviderError('cancelled'));
   const entry:Waiting={id,launch:()=>{
    if(signal.aborted){abort();return;}if(performance.now()>=deadline){finish(false,new ProviderError('timeout'));return;}
    started=true;this.count++;this.counts.set(id,(this.counts.get(id)??0)+1);this.lastId=id;
    try{void operation().then(value=>{if(!done){finish(true,undefined);resolve(value);}},error=>finish(false,error));}catch(error){finish(false,error);}
   }};
   if(signal.aborted){abort();return;}if(performance.now()>=deadline){finish(false,new ProviderError('timeout'));return;}
   if(this.queue.length>=20||this.queue.filter(e=>e.id===id).length>=8){reject(new Error('local_capacity'));return;}
   signal.addEventListener('abort',abort,{once:true});if(Number.isFinite(deadline))timer=setTimeout(()=>finish(false,new ProviderError('timeout')),Math.max(0,deadline-performance.now()));
   this.queue.push(entry);this.pump();
  });
 }
 private pump():void{
  while(this.count<4){
   const available=this.queue.filter(e=>(this.counts.get(e.id)??0)<2);const next=available.find(e=>e.id!==this.lastId)??available[0];if(!next)return;
   this.queue.splice(this.queue.indexOf(next),1);next.launch();
  }
 }
}
