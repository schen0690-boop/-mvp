import { describe, expect, it } from 'vitest';
import { validateCreateDraft } from '../../src/domain/input.js';

const requestId = '12345678-1234-4234-8234-123456789012';
describe('草稿运行时输入校验', () => {
  it('保留中文、内部空格及引号，只去首尾空白', () => {
    expect(validateCreateDraft({ topic: '  中文 "讨论"  如何改进？\n', expertCount: 4, requestId }))
      .toEqual({ topic: '中文 "讨论"  如何改进？', expertCount: 4, requestId });
  });
  it('只在人数缺省时默认4位专家', () => {
    expect(validateCreateDraft({ topic: '讨论', requestId }).expertCount).toBe(4);
  });
  it.each([1, 8])('人数边界 %s 合法', (expertCount) => {
    expect(validateCreateDraft({ topic: '讨论', expertCount, requestId }).expertCount).toBe(expertCount);
  });
  it.each([0, 9, -1, 1.5, null, '', '4', true, false, NaN, Infinity])('拒绝非法人数 %s', (expertCount) => {
    expect(() => validateCreateDraft({ topic: '讨论', expertCount, requestId })).toThrow();
  });
  it.each(['', ' \t\n', null, 3, false, [], {}].map(topic => ({ topic })))('拒绝空白或非字符串话题 $topic', ({ topic }) => {
    expect(() => validateCreateDraft({ topic, requestId })).toThrow();
  });
  it('长度按Unicode码点计算：500通过，501拒绝', () => {
    expect(validateCreateDraft({ topic: '😀'.repeat(500), requestId }).topic).toBe('😀'.repeat(500));
    expect(() => validateCreateDraft({ topic: '😀'.repeat(501), requestId })).toThrow();
  });
  it.each([null, [], 'topic', 1, true].map(input => ({ input })))('拒绝非对象请求 $input', ({ input }) => {
    expect(() => validateCreateDraft(input)).toThrow();
  });
  it.each(['status', 'discussionId', 'createdAt', 'confirmedLineupRevision', 'extra'])('拒绝未知/系统字段 %s', (field) => {
    expect(() => validateCreateDraft({ topic: '讨论', requestId, [field]: 'running' })).toThrow();
  });
  it.each([undefined, null, '', 'bad-id', 12])('requestId必须为UUID %s', (id) => {
    expect(() => validateCreateDraft({ topic: '讨论', requestId: id })).toThrow();
  });
});
