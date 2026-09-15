import type { DraftListItem, DraftSnapshot } from '../../src/domain/drafts.js';
import { isObject, validateCreateDraft, validateUuid } from '../../src/domain/input.js';
export type { DraftListItem, DraftSnapshot };
export interface CreateInput { topic: string; expertCount: number; requestId: string }
export interface CreateResult { discussionId: string; snapshot: DraftSnapshot; replayed: boolean }
export interface Api {
  create(input: CreateInput): Promise<CreateResult>;
  list(filter: 'active' | 'all'): Promise<DraftListItem[]>;
  get(id: string): Promise<DraftSnapshot>;
}
export function formInput(topic: string, count: string, id: string): CreateInput {
  if (!/^[1-8]$/.test(count)) throw new Error('请选择1至8位专家');
  return validateCreateDraft({ topic, expertCount: Number(count), requestId: id });
}
const protocolError = () => new Error('返回的数据不符合约定，请重新加载');
function keys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function validId(value: unknown): value is string {
  try { return validateUuid(value) === value; } catch { return false; }
}
function isItem(value: unknown): value is DraftListItem {
  return isObject(value) && validId(value.discussionId) && typeof value.topic === 'string' &&
    value.topic === value.topic.trim() && [...value.topic].length > 0 && [...value.topic].length <= 500 &&
    typeof value.expertCount === 'number' && Number.isInteger(value.expertCount) && value.expertCount >= 1 && value.expertCount <= 8 &&
    value.status === 'created' && value.version === 1 && timestamp(value.updatedAt);
}
function isSnapshot(value: unknown): value is DraftSnapshot {
  if (!isObject(value) || !isItem(value)) return false;
  const data: Record<string, unknown> = value;
  const nullFields = ['confirmedLineupRevision','synthesis','summary','lastNotice','stopReason','startedAt','endedAt'];
  return keys(data, ['discussionId','topic','expertCount','status','version','updatedAt','createdAt','lastEventId',
    'lineupRevision','transcriptVersion','roles','utterances',...nullFields]) &&
    timestamp(data.createdAt) && data.createdAt === data.updatedAt && data.lastEventId === 1 &&
    data.lineupRevision === 0 && data.transcriptVersion === 0 &&
    Array.isArray(data.roles) && data.roles.length === 0 && Array.isArray(data.utterances) && data.utterances.length === 0 &&
    nullFields.every(key => data[key] === null);
}
export function decodeSnapshot(value: unknown): DraftSnapshot {
  if (!isSnapshot(value)) throw protocolError();
  return value;
}
export function createApi(transport: typeof fetch = fetch): Api {
  async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try { response = await transport(path, { ...init, signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('网络连接中断，结果尚未确认。可重试原请求'); }
    if (!response.ok) {
      if (response.status === 409) throw new Error('请求标识冲突，请检查原请求；不会自动更换标识');
      if (response.status === 404) throw new Error('未找到这条讨论，可返回列表重新选择');
      if (response.status === 400) throw new Error('请求参数不符合要求，请检查话题与人数');
      throw new Error('服务暂时不可用，请重试');
    }
    try { return { status: response.status, body: await response.json() }; }
    catch { throw protocolError(); }
  }
  return {
    async create(input) {
      const { status, body } = await request('/api/discussions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (![200,201].includes(status) || !isObject(body) || !keys(body,['discussionId','snapshot','replayed']) ||
          !validId(body.discussionId) || body.replayed !== (status === 200)) throw protocolError();
      const snapshot = decodeSnapshot(body.snapshot);
      if (snapshot.discussionId !== body.discussionId || snapshot.topic !== input.topic || snapshot.expertCount !== input.expertCount) throw protocolError();
      return { discussionId: body.discussionId, snapshot, replayed: body.replayed };
    },
    async get(id) {
      const { status, body } = await request(`/api/discussions/${validateUuid(id)}`);
      const result = decodeSnapshot(body);
      if (status !== 200 || result.discussionId !== id) throw protocolError();
      return result;
    },
    async list(filter) {
      const { status, body } = await request(`/api/discussions?status=${filter}`);
      if (status !== 200 || !isObject(body) || !keys(body,['items']) || !Array.isArray(body.items) ||
          !body.items.every((item: unknown) => isObject(item) && isItem(item) && keys(item,['discussionId','topic','expertCount','status','version','updatedAt']))) throw protocolError();
      const items = body.items.filter(isItem);
      if (new Set(items.map(item => item.discussionId)).size !== items.length || (filter === 'active' && items.length > 0)) throw protocolError();
      return items;
    }
  };
}
