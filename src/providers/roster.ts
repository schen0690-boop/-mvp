export interface RosterInput {
  discussionId: string; topic: string; expertCount: number; constraints: string;
}
export interface RosterContext { signal: AbortSignal; deadline: number; repairIssues?: { path: string; rule: string }[] }
export interface RosterGenerator { generateRoster(input: RosterInput, context: RosterContext): Promise<string> }
export class ProviderError extends Error {
  constructor(public readonly kind: 'timeout' | 'transport' | 'configuration') { super(kind); }
}
