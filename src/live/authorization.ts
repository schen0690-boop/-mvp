import type { RosterInput,RosterContext } from '../providers/roster.js';
import { mkdirSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderError } from '../providers/roster.js';
import { validateUuid,isObject } from '../domain/input.js';
import type { RequestMetric } from '../providers/deepseek.js';
function writeNew(path:string,value:unknown){const fd=openSync(path,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}}
export class LiveAuthorization {
  constructor(readonly directory:string){mkdirSync(directory,{recursive:true});}
  reserve(input:RosterInput,context:RosterContext):number {
    try {
      if(this.closed||input.topic!=='AI 如何改善教育？'||input.expertCount!==4||context.signal.aborted||performance.now()>=context.deadline)throw new Error();
      const discussionId=validateUuid(input.discussionId),generationId=validateUuid(context.generationId);
      const binding=join(this.directory,'binding.json');
      if(!existsSync(binding)){
        if(this.count>0)throw new Error();
        try{writeNew(binding,{discussionId,generationId});}catch{if(!existsSync(binding))throw new Error();}
      }
      const saved:unknown=JSON.parse(readFileSync(binding,'utf8'));
      if(!isObject(saved)||saved.discussionId!==discussionId||saved.generationId!==generationId)throw new Error();
      for(const attempt of [1,2]){
        const slot=join(this.directory,`request-${attempt}.json`);if(existsSync(slot))continue;
        try{writeNew(slot,{attempt,discussionId,generationId,requestedModel:'deepseek-flash',reservedAt:new Date().toISOString()});return attempt;}
        catch{throw new Error();} // Never recover an uncertain reservation by sending another request.
      }
      throw new Error();
    }catch{throw new ProviderError('configuration');}
  }
  record(attempt:number,metric:RequestMetric):void {
    if(attempt!==1&&attempt!==2)throw new ProviderError('configuration');
    try{writeNew(join(this.directory,`result-${attempt}.json`),metric);}catch{this.close('audit_failure');throw new ProviderError('configuration');}
  }
  close(reason:string):void {
    if(this.closed)return;
    const safe=['valid_result','attempts_exhausted','permanent_failure','shutdown','audit_failure'].includes(reason)?reason:'shutdown';
    try{writeNew(join(this.directory,'closed.json'),{reason:safe,closedAt:new Date().toISOString()});}catch{if(!this.closed)throw new ProviderError('configuration');}
  }
  get count():number{return [1,2].filter(n=>existsSync(join(this.directory,`request-${n}.json`))).length;}
  get closed():boolean{return existsSync(join(this.directory,'closed.json'));}
}
