export interface DeepSeekConfig { baseUrl:string; model:string; apiKey:string; maxTokens:number }
export type RosterConfig={provider:'fake'}|{provider:'deepseek';deepseek:DeepSeekConfig};
export function readRosterConfig(values:Record<string,string|undefined>):RosterConfig {
  const provider=values.ROSTER_PROVIDER??'fake';
  if(provider==='fake')return {provider};
  const apiKey=values.DEEPSEEK_API_KEY?.trim()??'';
  const baseUrl=values.DEEPSEEK_BASE_URL??'https://api.deepseek.com',model=values.DEEPSEEK_MODEL??'deepseek-flash';
  const maxTokens=values.DEEPSEEK_MAX_TOKENS??'4096';
  if(provider!=='deepseek'||!apiKey||/[\s\u0000-\u001f\u007f]/u.test(apiKey)||baseUrl!=='https://api.deepseek.com'||model!=='deepseek-flash'||maxTokens!=='4096')throw new ProviderError('configuration');
  return {provider,deepseek:{baseUrl,model,apiKey,maxTokens:4096}};
}
import { ProviderError } from './roster.js';
