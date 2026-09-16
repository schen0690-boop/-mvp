import type { RosterContext, RosterGenerator, RosterInput } from './roster.js';
import { ProviderError } from './roster.js';
export type FakeMode = 'normal' | 'few' | 'many' | 'no-moderator' | 'two-moderators' | 'empty' | 'illegal-role' | 'duplicate' | 'timeout' | 'transport' | 'configuration' | 'invalid-structure' | 'business-invalid';
export type FakeResponse = FakeMode | ((input: RosterInput, context: RosterContext) => Promise<string>);
export class FakeRosterProvider implements RosterGenerator {
  readonly calls: { input: RosterInput; context: RosterContext }[] = [];
  constructor(private readonly responses: FakeResponse[] = ['normal']) {}
  async generateRoster(input: RosterInput, context: RosterContext): Promise<string> {
    const mode = this.responses[Math.min(this.calls.length, this.responses.length - 1)] ?? 'normal';
    this.calls.push({ input, context });
    if (typeof mode === 'function') return mode(input, context);
    if (mode === 'transport' || mode === 'configuration') throw new ProviderError(mode);
    if (mode === 'timeout') return new Promise((_resolve, reject) => {
      if (context.signal.aborted) reject(new ProviderError('timeout'));
      else context.signal.addEventListener('abort', () => reject(new ProviderError('timeout')), { once: true });
    });
    if (mode === 'invalid-structure') return 'not JSON (Fake)';
    const moderator = { role: 'moderator', name: '示例主持人', profession: '沟通', title: '主持人（Fake）', stance: '整理不同观点' };
    const roles = [moderator, ...Array.from({ length: input.expertCount }, (_, i) => ({
      role: 'expert', name: `示例专家${i + 1}`, profession: `研究方向${i + 1}`, title: '研究员（Fake）', stance: `从角度${i + 1}观察话题`
    }))];
    if (mode === 'few' || mode === 'business-invalid') roles.pop();
    if (mode === 'many') roles.push({ ...moderator, role: 'expert', name: '额外专家' });
    if (mode === 'no-moderator') roles.shift();
    if (mode === 'two-moderators') roles.push({ ...moderator, name: '第二主持人' });
    if (mode === 'empty') moderator.stance = ' ';
    if (mode === 'illegal-role') moderator.role = 'host';
    if (mode === 'duplicate' && roles[1]) roles[1].name = moderator.name;
    return JSON.stringify({ roles });
  }
}
