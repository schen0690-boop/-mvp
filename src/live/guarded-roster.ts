import type { RosterContext,RosterGenerator,RosterInput } from '../providers/roster.js';
import { ProviderError } from '../providers/roster.js';
import { parseRoster } from '../domain/lineup.js';
import type { LiveAuthorization } from './authorization.js';
/** Acceptance-only wrapper. Reuses the domain validator to close permission on the first valid result. */
export class GuardedRosterProvider implements RosterGenerator {
  constructor(private readonly provider:RosterGenerator,private readonly authorization:LiveAuthorization){}
  async generateRoster(input:RosterInput,context:RosterContext):Promise<string>{
    const attempt=this.authorization.reserve(input,context);
    try {
      const raw=await this.provider.generateRoster(input,{...context,acceptanceAttempt:attempt});
      if(context.signal.aborted)throw new ProviderError(context.signal.reason instanceof ProviderError&&context.signal.reason.kind==='timeout'?'timeout':'cancelled');
      if(performance.now()>=context.deadline)throw new ProviderError('timeout');
      parseRoster(raw,input.expertCount);this.authorization.close('valid_result');return raw;
    }catch(error){
      if(error instanceof ProviderError&&!error.retryable)this.authorization.close('permanent_failure');
      else if(attempt===2)this.authorization.close('attempts_exhausted');
      throw error;
    }
  }
}
