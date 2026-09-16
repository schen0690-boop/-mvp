import { expect,it } from 'vitest';
import { mkdirSync,mkdtempSync,readFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { LiveAuthorization } from '../../src/live/authorization.js';
const input={discussionId:'12345678-1234-4234-8234-123456789012',topic:'AI 如何改善教育？',expertCount:4,constraints:''};
const context={signal:new AbortController().signal,deadline:performance.now()+30000,generationId:'22345678-1234-4234-8234-123456789012'};
function setup(){mkdirSync('.tmp/stage-4d',{recursive:true});return new LiveAuthorization(mkdtempSync(resolve('.tmp/stage-4d/authorization-')));}
it('reserve is durable BEFORE outgoing call; restart shares two-request maximum',()=>{const a=setup();expect(a.reserve(input,context)).toBe(1);expect(a.count).toBe(1);const b=new LiveAuthorization(a.directory);expect(b.reserve(input,context)).toBe(2);expect(()=>new LiveAuthorization(a.directory).reserve(input,context)).toThrow();expect(b.count).toBe(2);});
it('rejects second discussion and second generation even with spare budget',()=>{const a=setup();a.reserve(input,context);expect(()=>a.reserve({...input,discussionId:context.generationId},context)).toThrow();expect(()=>a.reserve(input,{...context,generationId:input.discussionId})).toThrow();expect(a.count).toBe(1);});
it.each([{...input,topic:'其他话题'},{...input,expertCount:8}])('only approved sample can reserve %j',value=>{const a=setup();expect(()=>a.reserve(value,context)).toThrow();expect(a.count).toBe(0);});
it('success/cancel closure survives restart and cannot reopen',()=>{const a=setup();a.reserve(input,context);a.close('valid_result');const b=new LiveAuthorization(a.directory);expect(b.closed).toBe(true);expect(()=>b.reserve(input,context)).toThrow();expect(JSON.parse(readFileSync(join(a.directory,'closed.json'),'utf8')).reason).toBe('valid_result');});
it('missing generation or expired/cancelled request cannot consume budget',()=>{const a=setup();expect(()=>a.reserve(input,{signal:context.signal,deadline:context.deadline})).toThrow();expect(()=>a.reserve(input,{...context,deadline:0})).toThrow();expect(a.count).toBe(0);});
