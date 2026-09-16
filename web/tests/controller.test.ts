import { expect, it } from 'vitest';
import { Controller } from '../src/controller.js';
import type { Api, CreateInput, CreateResult, DraftSnapshot, DraftListItem } from '../src/api.js';
import { snapshot, id } from './fixtures.js';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {}); // A not-yet-implemented consumer may never subscribe during RED.
  return { promise, resolve, reject };
}
const result = { discussionId: id, snapshot, replayed: false };
function api(changes: Partial<Api> = {}): Api { return { generate: async () => { throw new Error('unused'); }, confirm: async () => result, create: async () => result, list: async () => [], get: async () => snapshot, ...changes }; }
it('防重复进入；成功选中快照、切all；明确再创建使用新标识', async () => {
  const wait = deferred<CreateResult>(); const requests: CreateInput[] = []; let n = 0;
  // Use valid stable UUIDs so the failing reason is lifecycle behavior, not input syntax.
  const make = new Controller(api({ create: async input => { requests.push(input); return wait.promise; } }), () => n++ === 0 ? id : '22345678-1234-4234-8234-123456789012');
  make.edit('中文','4'); const first = make.submit(); await make.submit();
  expect(requests.length).toBe(1); expect(make.getState().busy).toBe(true);
  wait.resolve(result); await first;
  expect(make.getState()).toMatchObject({ saved: true, filter: 'all', detail: snapshot, busy: false });
  await make.submit(); expect(requests[0]?.requestId).not.toBe(requests[1]?.requestId);
});
it('结果不确定重试保留原requestId及不可变正文；改内容生成新请求', async () => {
  const requests: CreateInput[] = []; let n = 0;
  const c = new Controller(api({ create: async input => { requests.push(input); throw new Error('网络连接中断'); } }), () => n++ === 0 ? id : '22345678-1234-4234-8234-123456789012');
  c.edit('中文','4'); await c.submit(); await c.submit();
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  c.edit('另一个话题','8'); await c.submit();
  expect(requests[2]?.requestId).not.toBe(requests[0]?.requestId); expect(requests[0]?.topic).toBe('中文');
});
it('创建成功而列表失败，保留成功和详情，恢复列表不重发POST', async () => {
  const c = new Controller(api({ list: async () => { throw new Error('列表暂时不可用'); } }), () => id);
  c.edit('中文','4'); await c.submit();
  expect(c.getState()).toMatchObject({ saved: true, createError: '', detail: snapshot, listError: '列表暂时不可用', busy: false });
});
it('详情旧成功或失败不得覆盖最新选中项及loading', async () => {
  const old = deferred<DraftSnapshot>(); const latest = deferred<DraftSnapshot>();
  const c = new Controller(api({ get: key => key === 'old' ? old.promise : latest.promise }));
  const a = c.select('old'); const b = c.select('new');
  latest.resolve(snapshot); await b; old.reject(new Error('旧错误')); await a;
  expect(c.getState()).toMatchObject({ selectedId: 'new', detail: snapshot, detailError: '', detailLoading: false });
});
it('列表旧成功与finally不得覆盖新过滤的加载状态', async () => {
  const old = deferred<DraftListItem[]>(); const latest = deferred<DraftListItem[]>();
  const c = new Controller(api({ list: filter => filter === 'active' ? old.promise : latest.promise }));
  const a = c.loadList('active'); const b = c.loadList('all'); old.resolve([]); await a;
  expect(c.getState()).toMatchObject({ filter: 'all', listLoading: true });
  latest.resolve([snapshot]); await b; expect(c.getState().items).toEqual([snapshot]);
});
it('详情失败结束加载，重新选择可恢复', async () => {
  let fail = true;
  const c = new Controller(api({ get: async () => { if (fail) throw new Error('加载失败'); return snapshot; } }));
  await c.select(id); expect(c.getState().detailError).toBe('加载失败'); expect(c.getState().detailLoading).toBe(false);
  fail = false; await c.select(id); expect(c.getState().detail).toEqual(snapshot);
});
it('非法输入不发请求，409不自动换标识', async () => {
  const requests: CreateInput[] = [];
  const c = new Controller(api({ create: async input => { requests.push(input); throw new Error('请求标识冲突'); } }), () => id);
  c.edit(' ','4'); await c.submit(); expect(c.getState().createError).toContain('话题'); expect(requests).toHaveLength(0);
  c.edit('中文','4'); await c.submit(); await c.submit();
  expect(c.getState().createError).toBe('请求标识冲突'); expect(requests[0]).toEqual(requests[1]);
});
