import { expect, it } from 'vitest';
import { FakeRosterProvider, type FakeMode } from '../../src/providers/fake-roster.js';
import { parseRoster } from '../../src/domain/lineup.js';
const input = { discussionId: 'test', topic: '中文讨论', expertCount: 4, constraints: 'test constraints' };
const context = () => ({ signal: new AbortController().signal, deadline: performance.now() + 30000 });
it('normal fake goes through the real validator for 1/4/8 experts', async () => {
  for (const expertCount of [1, 4, 8]) expect(parseRoster(await new FakeRosterProvider().generateRoster({ ...input, expertCount }, context()), expertCount)).toHaveLength(expertCount + 1);
});
it.each<FakeMode>(['few', 'many', 'no-moderator', 'two-moderators', 'empty', 'duplicate', 'business-invalid'])('fake %s is business-invalid', async mode => {
  const output = await new FakeRosterProvider([mode]).generateRoster(input, context());
  expect(() => parseRoster(output, 4)).toThrow('LINEUP_INVALID_MEMBERS');
});
it.each<FakeMode>(['illegal-role', 'invalid-structure'])('fake %s is structure-invalid', async mode => {
  const output = await new FakeRosterProvider([mode]).generateRoster(input, context());
  expect(() => parseRoster(output, 4)).toThrow('LINEUP_INVALID_STRUCTURE');
});
it.each<FakeMode>(['transport', 'configuration'])('fake %s is a typed provider failure', async mode => {
  await expect(new FakeRosterProvider([mode]).generateRoster(input, context())).rejects.toMatchObject({ kind: mode });
});
it('timeout waits for cancellation and controlled callback can deliberately return late', async () => {
  const controller = new AbortController();
  const pending = new FakeRosterProvider(['timeout']).generateRoster(input, { signal: controller.signal, deadline: 30000 });
  const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  controller.abort(); await assertion;
  let release!: (value: string) => void;
  const provider = new FakeRosterProvider([() => new Promise(resolve => { release = resolve; })]);
  const late = provider.generateRoster(input, { signal: controller.signal, deadline: 30000 });
  release('late'); expect(await late).toBe('late');
});
