import type { DraftListItem, DraftSnapshot } from '../../src/domain/drafts.js';
import { colors, parseRoster } from '../../src/domain/lineup.js';
import { noticeMessages, noticeOf, type DiscussionStatus } from '../../src/domain/snapshot.js';
import { isObject, validateCreateDraft, validateUuid } from '../../src/domain/input.js';
import { validateGenerate, validateConfirm } from '../../src/domain/lineup.js';
export type { DraftListItem, DraftSnapshot };
export interface CreateInput { topic: string; expertCount: number; requestId: string }
export interface CreateResult { discussionId: string; snapshot: DraftSnapshot; replayed: boolean }
export interface GenerateInput { requestId: string; expectedGenerationId: string | null }
export interface ConfirmInput { generationId: string; lineupRevision: number }
export interface GenerateResult extends CreateResult { generationId: string; generationVersion: number }
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export interface Api {
  create(input: CreateInput): Promise<CreateResult>;
  list(filter: 'active' | 'all'): Promise<DraftListItem[]>;
  get(id: string, signal?: AbortSignal): Promise<DraftSnapshot>;
  generate(id: string, input: GenerateInput): Promise<GenerateResult>;
  confirm(id: string, input: ConfirmInput): Promise<CreateResult>;
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
export const statusLabels: Record<DiscussionStatus,string> = {
  created:'草稿', generating_lineup:'阵容生成中', awaiting_confirmation:'阵容待确认',
  lineup_generation_failed:'阵容生成失败', lineup_confirmed:'阵容已确认'
};
function status(value: unknown): value is DiscussionStatus {
  return value === 'created' || value === 'generating_lineup' || value === 'awaiting_confirmation' || value === 'lineup_generation_failed' || value === 'lineup_confirmed';
}
function positive(value: unknown): value is number { return typeof value==='number' && Number.isSafeInteger(value) && value>0; }
function isItem(value: unknown): value is DraftListItem {
  return isObject(value) && validId(value.discussionId) && typeof value.topic === 'string' &&
    value.topic === value.topic.trim() && [...value.topic].length > 0 && [...value.topic].length <= 500 &&
    typeof value.expertCount === 'number' && Number.isInteger(value.expertCount) && value.expertCount >= 1 && value.expertCount <= 8 &&
    status(value.status) && positive(value.version) && (value.status==='created' ? value.version===1 : value.version>=2) && timestamp(value.updatedAt);
}
function isSnapshot(value: unknown): value is DraftSnapshot {
  if (!isObject(value) || !isItem(value)) return false;
  const data: Record<string, unknown> = value;
  const nullFields = ['synthesis','summary','stopReason','startedAt','endedAt'];
  const baseKeys = ['discussionId','topic','expertCount','status','version','updatedAt','createdAt','lastEventId',
    'lineupRevision','confirmedLineupRevision','transcriptVersion','roles','utterances','lastNotice',...nullFields];
  if (!timestamp(data.createdAt) || data.createdAt>value.updatedAt || data.lastEventId!==value.version || data.transcriptVersion!==0 ||
      !Array.isArray(data.roles) || !Array.isArray(data.utterances) || data.utterances.length!==0 || !nullFields.every(key=>data[key]===null)) return false;
  if(value.status==='created') return keys(data,baseKeys) && data.createdAt===data.updatedAt && data.lineupRevision===0 &&
    data.confirmedLineupRevision===null && data.lastNotice===null && data.roles.length===0;
  if(!keys(data,[...baseKeys,'lineupGeneration','confirmedAt'])) return false;
  const generation=data.lineupGeneration;
  if(!isObject(generation) || !keys(generation,['generationId','generationVersion','startedAt','finishedAt']) ||
      !validId(generation.generationId) || !positive(generation.generationVersion) || !timestamp(generation.startedAt) ||
      generation.startedAt<data.createdAt || generation.startedAt>value.updatedAt ||
      typeof data.lineupRevision!=='number' || !Number.isSafeInteger(data.lineupRevision) || data.lineupRevision<0 || data.lineupRevision>generation.generationVersion) return false;
  if(value.status==='generating_lineup') {
    if(generation.finishedAt!==null) return false;
  } else if(!timestamp(generation.finishedAt) || generation.finishedAt<generation.startedAt || generation.finishedAt>value.updatedAt || value.version<3) return false;
  if(value.status==='lineup_confirmed') {
    if(data.confirmedLineupRevision!==data.lineupRevision || !timestamp(data.confirmedAt) || data.confirmedAt!==value.updatedAt || value.version<4) return false;
  } else if(data.confirmedAt!==null || data.confirmedLineupRevision!==null) return false;
  if(value.status==='lineup_generation_failed') {
    const notice=data.lastNotice;
    if(!isObject(notice) || !keys(notice,['code','message','retryable','action'])) return false;
    let valid=false;
    for(const key of Object.keys(noticeMessages) as (keyof typeof noticeMessages)[]) {
      if(notice.code===key) { const expected=noticeOf(key);valid=notice.message===expected.message && notice.retryable===expected.retryable && notice.action===expected.action; }
    }
    if(!valid) return false;
  } else if(data.lastNotice!==null) return false;
  if(value.status==='generating_lineup' || value.status==='lineup_generation_failed') return data.roles.length===0 && data.lineupRevision<generation.generationVersion;
  if(data.lineupRevision!==generation.generationVersion || data.roles.length!==value.expertCount+1) return false;
  const ids=new Set<string>();
  const candidates: unknown[]=[];
  for(const [index,member] of data.roles.entries()) {
    if(!isObject(member) || !keys(member,['memberId','role','name','profession','title','stance','color','displayOrder']) ||
        !validId(member.memberId) || ids.has(member.memberId) || member.displayOrder!==index || member.color!==colors[index] ||
        member.role!==(index===0?'moderator':'expert')) return false;
    ids.add(member.memberId);
    const candidate={role:member.role,name:member.name,profession:member.profession,title:member.title,stance:member.stance};
    if([member.name,member.profession,member.title,member.stance].some(v=>typeof v!=='string'||v!==v.trim()))return false;
    candidates.push(candidate);
  }
  try { parseRoster(JSON.stringify({roles:candidates}),value.expertCount); } catch { return false; }
  return true;
}
export function decodeSnapshot(value: unknown): DraftSnapshot {
  if (!isSnapshot(value)) throw protocolError();
  return value;
}
export function createApi(transport: typeof fetch = fetch): Api {
  async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try { response = await transport(path, { ...init, signal: init?.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }); }
    catch { throw new ApiError('网络连接中断，结果尚未确认。可重试原请求',0); }
    if (!response.ok) {
      if (response.status === 409) throw new ApiError('请求标识冲突，请检查原请求；不会自动更换标识',409);
      if (response.status === 404) throw new ApiError('未找到这条讨论，可返回列表重新选择',404);
      if (response.status === 400) throw new ApiError('请求参数不符合要求，请检查话题与人数',400);
      throw new ApiError('服务暂时不可用，请重试',response.status);
    }
    try { return { status: response.status, body: await response.json() }; }
    catch { throw protocolError(); }
  }
  return {
    async generate(id,input) {
      const {status,body}=await request(`/api/discussions/${validateUuid(id)}/lineup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validateGenerate(input))});
      if(![200,202].includes(status)||!isObject(body)||!keys(body,['discussionId','generationId','generationVersion','snapshot','replayed'])||
        body.discussionId!==id||!validId(body.generationId)||!positive(body.generationVersion)||typeof body.replayed!=='boolean')throw protocolError();
      const snapshot=decodeSnapshot(body.snapshot);
      if(snapshot.discussionId!==id||snapshot.lineupGeneration?.generationId!==body.generationId||snapshot.lineupGeneration.generationVersion!==body.generationVersion||
        !['generating_lineup','awaiting_confirmation','lineup_generation_failed'].includes(snapshot.status)||
        (status===202)!==(snapshot.status==='generating_lineup')||status===200&&!body.replayed)throw protocolError();
      return {discussionId:id,generationId:body.generationId,generationVersion:body.generationVersion,snapshot,replayed:body.replayed};
    },
    async confirm(id,input) {
      const {status,body}=await request(`/api/discussions/${validateUuid(id)}/lineup/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validateConfirm(input))});
      if(status!==200||!isObject(body)||!keys(body,['discussionId','snapshot','replayed'])||body.discussionId!==id||typeof body.replayed!=='boolean')throw protocolError();
      const snapshot=decodeSnapshot(body.snapshot);
      if(snapshot.discussionId!==id||snapshot.status!=='lineup_confirmed'||snapshot.lineupGeneration?.generationId!==input.generationId||snapshot.lineupRevision!==input.lineupRevision)throw protocolError();
      return {discussionId:id,snapshot,replayed:body.replayed};
    },
    async create(input) {
      const { status, body } = await request('/api/discussions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (![200,201].includes(status) || !isObject(body) || !keys(body,['discussionId','snapshot','replayed']) ||
          !validId(body.discussionId) || body.replayed !== (status === 200)) throw protocolError();
      const snapshot = decodeSnapshot(body.snapshot);
      if (snapshot.discussionId !== body.discussionId || snapshot.topic !== input.topic || snapshot.expertCount !== input.expertCount) throw protocolError();
      return { discussionId: body.discussionId, snapshot, replayed: body.replayed };
    },
    async get(id,signal) {
      const { status, body } = await request(`/api/discussions/${validateUuid(id)}`,{signal:signal??null});
      const result = decodeSnapshot(body);
      if (status !== 200 || result.discussionId !== id) throw protocolError();
      return result;
    },
    async list(filter) {
      const { status, body } = await request(`/api/discussions?status=${filter}`);
      if (status !== 200 || !isObject(body) || !keys(body,['items']) || !Array.isArray(body.items) ||
          !body.items.every((item: unknown) => isObject(item) && isItem(item) && keys(item,['discussionId','topic','expertCount','status','version','updatedAt']))) throw protocolError();
      const items = body.items.filter(isItem);
      if (new Set(items.map(item => item.discussionId)).size !== items.length || (filter === 'active' && items.some(item=>item.status!=='generating_lineup' && item.status!=='awaiting_confirmation'))) throw protocolError();
      return items;
    }
  };
}
