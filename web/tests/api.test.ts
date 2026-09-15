import { expect, it } from 'vitest';
import { createApi, decodeSnapshot, formInput } from '../src/api.js';
import { id, snapshot } from './fixtures.js';
it('表单转换保留中文空格、组合字符，按码点计数', () => {
  expect(formInput('  中  文 e\u0301 😀 ', '4', id)).toEqual({ topic: '中  文 e\u0301 😀', expertCount: 4, requestId: id });
  expect(formInput('😀'.repeat(500), '8', id).topic).toHaveLength(1000);
  expect(() => formInput('😀'.repeat(501), '4', id)).toThrow();
});
it.each(['', '0', '9', '1.5', 'true', '04'])('拒绝非法表单人数 %s', count => {
  expect(() => formInput('中文', count, id)).toThrow();
});
it('完整快照接受，字段缺失/未知字段/非法状态拒绝', () => {
  expect(decodeSnapshot(snapshot)).toEqual(snapshot);
  expect(() => decodeSnapshot({ ...snapshot, summary: undefined })).toThrow();
  expect(() => decodeSnapshot({ ...snapshot, debug: '内部' })).toThrow();
  expect(() => decodeSnapshot({ ...snapshot, status: 'unknown' })).toThrow();
});
it.each([200, 201])('创建HTTP %s成功，验证重放和完整结构', async status => {
  const api = createApi(async () => new Response(JSON.stringify({ discussionId: id, snapshot, replayed: status === 200 }), { status }));
  expect((await api.create({ topic: '中文', expertCount: 4, requestId: id })).snapshot).toEqual(snapshot);
});
it('409显示受控冲突，HTML与异常JSON不泄露', async () => {
  const conflict = createApi(async () => new Response('{"error":{"message":"SQL internal"}}', { status: 409 }));
  await expect(conflict.create({ topic: '中文', expertCount: 4, requestId: id })).rejects.toThrow('请求标识冲突');
  const bad = createApi(async () => new Response('<html>SQL stack</html>', { status: 200 }));
  await expect(bad.get(id)).rejects.toThrow('返回的数据不符合约定');
});
