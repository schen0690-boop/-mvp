import type {DeepSeekConfig} from './config.js';
import {readRosterConfig} from './config.js';
import type {RosterContext,RosterGenerator,RosterInput} from './roster.js';
import {RosterValidationError} from '../domain/lineup.js';
import {rosterMessages} from './roster-prompt.js';
import {requestCompletion,type RequestMetric} from './deepseek-transport.js';
export type {RequestMetric} from './deepseek-transport.js';
export class DeepSeekRosterProvider implements RosterGenerator {
 constructor(private readonly config:DeepSeekConfig,private readonly transport:typeof fetch,private readonly record:(metric:RequestMetric)=>void=()=>{}){}
 async generateRoster(input:RosterInput,context:RosterContext):Promise<string>{
  readRosterConfig({ROSTER_PROVIDER:'deepseek',DEEPSEEK_BASE_URL:this.config.baseUrl,DEEPSEEK_MODEL:this.config.model,DEEPSEEK_API_KEY:this.config.apiKey,DEEPSEEK_MAX_TOKENS:String(this.config.maxTokens)});
  return requestCompletion(this.config,this.transport,rosterMessages(input,context),context,()=>new RosterValidationError('LINEUP_INVALID_STRUCTURE'),this.record);
 }
}
