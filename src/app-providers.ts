import {FakeRosterProvider} from './providers/fake-roster.js';
import {DeepSeekRosterProvider} from './providers/deepseek.js';
import {readRosterConfig} from './providers/config.js';
import {readDiscussionConfig,createDiscussionProvider} from './providers/discussion-config.js';
import {ProviderError,type RosterGenerator} from './providers/roster.js';
import type {DiscussionProvider} from './providers/discussion.js';
export interface PublicProviders {rosterProvider:'fake'|'deepseek';discussionProvider:'fake'|'deepseek'}
/** Configuration is backend-only. Construction performs no request; an explicit CLI opt-in is also required. */
export function selectProviders(values:Record<string,string|undefined>,allowReal=false,transport:typeof fetch=fetch):{roster:RosterGenerator;discussion:DiscussionProvider;publicConfig:PublicProviders}{
 const roster=readRosterConfig(values),discussion=readDiscussionConfig(values);
 if(!allowReal&&(roster.provider==='deepseek'||discussion.provider==='deepseek'))throw new ProviderError('configuration');
 return {roster:roster.provider==='fake'?new FakeRosterProvider():new DeepSeekRosterProvider(roster.deepseek,transport),discussion:createDiscussionProvider(discussion,transport),publicConfig:{rosterProvider:roster.provider,discussionProvider:discussion.provider}};
}
