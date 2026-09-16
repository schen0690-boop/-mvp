import { expect,it } from 'vitest';
import { readRosterConfig } from '../../src/providers/config.js';
const base={ROSTER_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'unit-dummy-key'};
it('explicit fake/default ignore even existing real-looking environment values',()=>{
  expect(readRosterConfig({DEEPSEEK_API_KEY:'unit-dummy-key'})).toEqual({provider:'fake'});
  expect(readRosterConfig({...base,ROSTER_PROVIDER:'fake'})).toEqual({provider:'fake'});
});
it('DeepSeek has pinned official endpoint/model and user cap',()=>{expect(readRosterConfig(base)).toEqual({provider:'deepseek',deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',maxTokens:4096,apiKey:'unit-dummy-key'}});});
it.each([{...base,DEEPSEEK_API_KEY:''},{...base,DEEPSEEK_API_KEY:'a\nb'},{...base,DEEPSEEK_BASE_URL:'https://evil.example'},{...base,DEEPSEEK_BASE_URL:'http://api.deepseek.com'},{...base,DEEPSEEK_MODEL:'other'},{...base,DEEPSEEK_MAX_TOKENS:'8192'},{...base,ROSTER_PROVIDER:'unknown'}])('invalid real config fails closed without fallback or exposing key',values=>{expect(()=>readRosterConfig(values)).toThrow('configuration');});
