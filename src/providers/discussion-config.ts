import {readRosterConfig,type RosterConfig} from './config.js';
import {ProviderError} from './roster.js';
import {FakeDiscussionProvider} from './fake-discussion.js';
import {DeepSeekDiscussionProvider,type DiscussionMetric} from './deepseek-discussion.js';
export function readDiscussionConfig(values:Record<string,string|undefined>):RosterConfig{
 const provider=values.DISCUSSION_PROVIDER??'fake';
 if(provider==='fake')return {provider};
 if(provider!=='deepseek')throw new ProviderError('configuration');
 return readRosterConfig({ROSTER_PROVIDER:provider,DEEPSEEK_API_KEY:values.DEEPSEEK_API_KEY,DEEPSEEK_MODEL:values.DEEPSEEK_MODEL,DEEPSEEK_BASE_URL:values.DEEPSEEK_BASE_URL,DEEPSEEK_MAX_TOKENS:'4096'});
}
export function createDiscussionProvider(config:RosterConfig,transport?:typeof fetch,record?:(m:DiscussionMetric)=>void){
 if(config.provider==='fake')return new FakeDiscussionProvider();
 if(!transport)throw new ProviderError('configuration');
 return new DeepSeekDiscussionProvider(config.deepseek,transport,record);
}
