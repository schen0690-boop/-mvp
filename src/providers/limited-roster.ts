import type {RosterGenerator} from './roster.js';
import type {CallLimiter} from './call-limiter.js';
export class LimitedRosterProvider implements RosterGenerator {
 constructor(private readonly provider:RosterGenerator,private readonly limiter:CallLimiter){}
 generateRoster:RosterGenerator['generateRoster']=(input,context)=>this.limiter.run(input.discussionId,context.signal,context.deadline,()=>this.provider.generateRoster(input,context));
}
