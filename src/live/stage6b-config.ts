import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {join} from 'node:path';
import {readDiscussionConfig} from '../providers/discussion-config.js';
import {ProviderError} from '../providers/roster.js';
import {projectRoot} from './stage6b-settings.js';
export function loadStage6bConfig(file=join(projectRoot,'.env.backend.local')){
 try{const raw=readFileSync(file,'utf8');if(Buffer.byteLength(raw)>32768)throw Error();const config=readDiscussionConfig({...parseEnv(raw),DISCUSSION_PROVIDER:'deepseek'});if(config.provider!=='deepseek')throw Error();return config.deepseek;}
 catch{throw new ProviderError('configuration');}
}
