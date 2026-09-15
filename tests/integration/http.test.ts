import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { DraftService } from '../../src/domain/drafts.js';
import { isObject } from '../../src/domain/input.js';
import { createApp, type Diagnostic } from '../../src/http/app.js';
import { temporaryDatabase } from '../helpers/database.js';

let db: DatabaseSync;
let server: Server;
let base: string;
let diagnostics: Diagnostic[];
beforeEach(async () => {
  ({ db } = temporaryDatabase());
  initializeDatabase(db);
  diagnostics = [];
  server = createApp(new DraftService(new SqliteDraftStore(db)), event => diagnostics.push(event)).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
});
const request = () => ({ topic: '  中文讨论 "未来" ', requestId: randomUUID() });
function post(body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  return fetch(`${base}/api/discussions`, { method: 'POST', headers, body });
}
async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isObject(body)) throw new Error('Expected JSON object');
  return body;
}
async function errorResponse(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/json');
  const body = await json(response);
  expect(Object.keys(body)).toEqual(['error']);
  expect(body.error).toEqual({ code, message: expect.any(String), retryable: status === 500,
    action: status === 500 ? 'try_again' : 'none', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(JSON.stringify(body)).not.toMatch(/SELECT|INSERT|SQLITE|\.sqlite|stack|node_modules|controlled-sensitive-path/i);
  return body;
}

it('真实HTTP创建201、查询200，公开字段不含内部数据', async () => {
  const response = await post(JSON.stringify(request()));
  expect(response.status).toBe(201);
  const body = await json(response);
  expect(body).toEqual({ discussionId: expect.any(String), replayed: false, snapshot: expect.objectContaining({ topic: '中文讨论 "未来"', expertCount: 4, status: 'created' }) });
  const fetched = await fetch(`${base}/api/discussions/${body.discussionId}`);
  expect(fetched.status).toBe(200);
  expect(fetched.headers.get('cache-control')).toBe('no-store');
  expect(await json(fetched)).toEqual(body.snapshot);
  expect(JSON.stringify(body)).not.toMatch(/create_request_id|runEpoch|DatabaseSync|\.sqlite|requestId/);
});
it('并发重复创建只一条201，其余200，输入改变409', async () => {
  const input = request();
  const responses = await Promise.all(Array.from({ length: 3 }, () => post(JSON.stringify(input))));
  expect(responses.map(response => response.status).sort()).toEqual([200, 200, 201]);
  const bodies = await Promise.all(responses.map(json));
  expect(new Set(bodies.map(body => body.discussionId)).size).toBe(1);
  await errorResponse(await post(JSON.stringify({ ...input, expertCount: 8 })), 409, 'IDEMPOTENCY_CONFLICT');
  expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(1);
  expect(db.prepare('SELECT COUNT(*) AS count FROM public_events').get()?.count).toBe(1);
});
it('列表空态、草稿过滤、公开列表字段和非法过滤', async () => {
  const empty = await fetch(`${base}/api/discussions?status=all`);
  expect(empty.status).toBe(200);
  expect(await json(empty)).toEqual({ items: [] });
  const created = await json(await post(JSON.stringify(request())));
  expect(await json(await fetch(`${base}/api/discussions`))).toEqual({ items: [] });
  const all = await fetch(`${base}/api/discussions?status=all`);
  expect(all.status).toBe(200);
  expect(await json(all)).toEqual({ items: [{ discussionId: created.discussionId, topic: '中文讨论 "未来"',
    expertCount: 4, status: 'created', version: 1, updatedAt: expect.any(String) }] });
  for (const query of ['status=bad', 'status=all&status=active', 'unexpected=1']) {
    await errorResponse(await fetch(`${base}/api/discussions?${query}`), 400, 'INVALID_INPUT');
  }
});
it.each(['{', 'null', '[]', '"文本"', '1', 'true', ''])('格式错误或请求体形状错误 %s 返回400', async body => {
  await errorResponse(await post(body), 400, 'INVALID_INPUT');
  expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(0);
});
it.each([{ expertCount: null }, { expertCount: '4' }, { topic: ' ' }, { status: 'running' }, { requestId: 'invalid' }])('业务校验失败 %# 不落库', async change => {
  await errorResponse(await post(JSON.stringify({ ...request(), ...change })), 400, 'INVALID_INPUT');
  expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(0);
});
it('有效但不存在UUID为404，错误UUID为400', async () => {
  await errorResponse(await fetch(`${base}/api/discussions/${randomUUID()}`), 404, 'NOT_FOUND');
  await errorResponse(await fetch(`${base}/api/discussions/bad-id`), 400, 'INVALID_INPUT');
});
it('JSON正文限16KiB，错误Content-Type及跨站Origin均拒绝', async () => {
  await errorResponse(await post(JSON.stringify({ ...request(), topic: 'x'.repeat(17000) })), 400, 'INVALID_INPUT');
  await errorResponse(await post(JSON.stringify(request()), { 'Content-Type': 'text/plain' }), 400, 'INVALID_INPUT');
  await errorResponse(await post(JSON.stringify(request()), { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }), 400, 'INVALID_INPUT');
  const allowed = await post(JSON.stringify(request()), { 'Content-Type': 'application/json', Origin: base });
  expect(allowed.status).toBe(201);
});
it('真实存储异常返回脱敏500，诊断与公开响应分开，事务回滚', async () => {
  db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON public_events BEGIN SELECT RAISE(ABORT, 'controlled-sensitive-path.sqlite SQL INSERT'); END");
  const body = await errorResponse(await post(JSON.stringify(request())), 500, 'INTERNAL_ERROR');
  if (!isObject(body.error)) throw new Error('Expected error object');
  expect(diagnostics).toEqual([{ requestId: body.error.requestId, code: 'INTERNAL_ERROR' }]);
  expect(db.prepare('SELECT COUNT(*) AS count FROM discussions').get()?.count).toBe(0);
});
