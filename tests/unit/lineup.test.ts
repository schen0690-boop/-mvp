import { describe, expect, it } from 'vitest';
import { colors, enrichRoster, parseRoster, validateConfirm, validateGenerate } from '../../src/domain/lineup.js';
const id = '11111111-1111-4111-8111-111111111111';
const moderator = { role: 'moderator', name: ' 主持人 ', profession: '沟通', title: '主持', stance: '中立' };
const expert = { role: 'expert', name: '甲 “乙”', profession: '研究', title: '研究员', stance: ' 保留 内部空格 ' };
const raw = (roles: unknown[]) => JSON.stringify({ roles });
describe('lineup pipeline', () => {
  it('normalizes Chinese and assigns UUID, moderator first, fixed unique colors', () => {
    const members = enrichRoster(parseRoster(raw([expert, moderator]), 1));
    expect(members.map(m => [m.role, m.displayOrder, m.color])).toEqual([['moderator', 0, colors[0]], ['expert', 1, colors[1]]]);
    expect(members[1]?.stance).toBe('保留 内部空格');
    expect(members[1]?.name).toBe('甲 “乙”');
    expect(new Set(members.map(m => m.memberId)).size).toBe(2);
    expect(members.every(m => /^[0-9a-f-]{36}$/.test(m.memberId))).toBe(true);
  });
  it.each([1, 4, 8])('accepts exactly %i experts and one moderator', n => {
    expect(parseRoster(raw([moderator, ...Array.from({ length: n }, (_, i) => ({ ...expert, name: `专家${i}` }))]), n)).toHaveLength(n + 1);
  });
  it.each([[], [expert], [moderator], [moderator, moderator, expert], [moderator, expert, { ...expert, name: '另一个' }]].map(roles => ({ roles })))('rejects wrong counts $roles', ({ roles }) => {
    expect(() => parseRoster(raw(roles), 1)).toThrow('LINEUP_INVALID_MEMBERS');
  });
  it.each([null, {}, 'not json', '```json\n{}\n```', '{}{}', '[]', '{"roles":null}', raw([{ ...moderator, role: 'host' }, expert]), raw([{ ...moderator, name: 5 }, expert]), raw([{ ...moderator, title: undefined }, expert]), raw([{ ...moderator, memberId: id }, expert]), raw([{ ...moderator, color: '#ffffff' }, expert]), raw([{ ...moderator, reasoning: 'private' }, expert]), ' '.repeat(16385)])('rejects structure %j', value => {
    expect(() => parseRoster(value, 1)).toThrow('LINEUP_INVALID_STRUCTURE');
  });
  it.each([' ', '字'.repeat(65), 'a\nb', 'a\u0000b'])('rejects invalid text %j', name => {
    expect(() => parseRoster(raw([moderator, { ...expert, name }]), 1)).toThrow('LINEUP_INVALID_MEMBERS');
  });
  it('counts Unicode codepoints and rejects normalized duplicate names across roles', () => {
    expect(parseRoster(raw([moderator, { ...expert, name: '😀'.repeat(64) }]), 1)[1]?.name).toHaveLength(128);
    expect(() => parseRoster(raw([{ ...moderator, name: 'Ａ  B' }, { ...expert, name: 'a b' }]), 1)).toThrow('LINEUP_INVALID_MEMBERS');
  });
  it('accepts only explicit generation and confirmation inputs', () => {
    expect(validateGenerate({ requestId: id, expectedGenerationId: null })).toEqual({ requestId: id, expectedGenerationId: null });
    expect(validateConfirm({ generationId: id, lineupRevision: 1 })).toEqual({ generationId: id, lineupRevision: 1 });
  });
  it.each([{}, null, { requestId: id }, { requestId: id, expectedGenerationId: null, force: true }, { requestId: id, expectedGenerationId: 'bad' }])('rejects generation input %j', value => {
    expect(() => validateGenerate(value)).toThrow();
  });
  it.each([{}, { generationId: id, lineupRevision: 0 }, { generationId: id, lineupRevision: '1' }, { generationId: id, lineupRevision: 1, confirmedAt: 'x' }])('rejects confirm input %j', value => {
    expect(() => validateConfirm(value)).toThrow();
  });
});
