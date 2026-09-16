import { expect,it } from 'vitest';
import { mkdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { loadBackendConfig } from '../../src/backend-config.js';
it('explicit backend file loads only file config, empty/missing file fails safely',()=>{
  mkdirSync('.tmp/stage-4d',{recursive:true});const file=join(mkdtempSync(resolve('.tmp/stage-4d/config-')),'test.env');
  expect(()=>loadBackendConfig(file)).toThrow('configuration');
  writeFileSync(file,'ROSTER_PROVIDER=deepseek\nDEEPSEEK_API_KEY=\n');expect(()=>loadBackendConfig(file)).toThrow('configuration');
  writeFileSync(file,'ROSTER_PROVIDER=deepseek\nDEEPSEEK_API_KEY="local-dummy-value"\n');expect(loadBackendConfig(file)).toMatchObject({provider:'deepseek',deepseek:{apiKey:'local-dummy-value'}});
  writeFileSync(file,'ROSTER_PROVIDER=fake\nDEEPSEEK_API_KEY="local-dummy-value"\n');expect(loadBackendConfig(file)).toEqual({provider:'fake'});
});
