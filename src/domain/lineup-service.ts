import { randomUUID } from 'node:crypto';
import type { DiscussionSnapshot, NoticeCode } from './snapshot.js';
import type { LineupMember } from './lineup.js';
import { enrichRoster, parseRoster, validateGenerate, validateConfirm, RosterValidationError } from './lineup.js';
import { validateUuid } from './input.js';
import { AppError } from './errors.js';
import type { RosterGenerator } from '../providers/roster.js';
import { ProviderError } from '../providers/roster.js';
export interface GenerationResult { discussionId: string; generationId: string; generationVersion: number; snapshot: DiscussionSnapshot; replayed: boolean }
export interface StoredDiscussion { snapshot: DiscussionSnapshot; requestId: string | null; baseId: string | null }
export interface GenerationKey { generationId: string; generationVersion: number }
export interface LineupOptions { capacity?: number; diagnose?: (event: { code: string; discussionId: string; generationId: string }) => void }
export interface LineupStore {
  read(id: string): StoredDiscussion | undefined;
  begin(id: string, input: { requestId: string; expectedGenerationId: string | null }, generationId: string, time: string): GenerationResult;
  complete(id: string, key: GenerationKey, members: LineupMember[], time: string, deadline?: number): boolean;
  fail(id: string, key: GenerationKey, code: NoticeCode, time: string): boolean;
  recover(time: string): void;
  confirm(id: string, input: { generationId: string; lineupRevision: number }, time: string): { discussionId: string; snapshot: DiscussionSnapshot; replayed: boolean };
}
export function assertGenerationState(status: string): void {
  if (!['created', 'generating_lineup', 'awaiting_confirmation', 'lineup_generation_failed'].includes(status)) throw new AppError('INVALID_STATE', '当前状态不能生成阵容', 409);
}
export function generationDecision(record: StoredDiscussion, input: { requestId: string; expectedGenerationId: string | null }): 'replay' | 'new' {
  const { snapshot } = record;
  assertGenerationState(snapshot.status);
  if (record.requestId === input.requestId) {
    if (record.baseId !== input.expectedGenerationId) throw new AppError('IDEMPOTENCY_CONFLICT', '请求标识与生成依据不匹配', 409);
    return 'replay';
  }
  if (snapshot.status === 'generating_lineup') throw new AppError('GENERATION_IN_PROGRESS', '阵容正在生成', 409);
  if ((snapshot.lineupGeneration?.generationId ?? null) !== input.expectedGenerationId) throw new AppError('STALE_GENERATION', '生成版本已更新，请刷新', 409);
  return 'new';
}
export class LineupService {
  private readonly tasks = new Map<Promise<void>, AbortController>();
  private readonly unavailable = new Set<string>();
  private active = 0;
  private closing = false;
  constructor(private readonly store: LineupStore, private readonly provider: RosterGenerator, private readonly options: LineupOptions = {}) {}
  private storage<T>(fn: () => T): T {
    try { return fn(); } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('STORAGE_UNAVAILABLE', '讨论存储暂时不可用，请稍后重试', 503);
    }
  }
  assertAvailable(id?: string): void {
    if (id ? this.unavailable.has(id) : this.unavailable.size > 0) throw new AppError('STORAGE_UNAVAILABLE', '讨论存储暂时不可用，请稍后重试', 503);
  }
  generate(id: unknown, body: unknown): GenerationResult {
    const discussionId = validateUuid(id); const input = validateGenerate(body); this.assertAvailable(discussionId);
    if (this.closing) throw new AppError('STORAGE_UNAVAILABLE', '服务正在关闭，请稍后重试', 503);
    const record = this.storage(() => this.store.read(discussionId)); if (!record) throw new AppError('NOT_FOUND', '未找到讨论', 404);
    const replay = generationDecision(record, input) === 'replay';
    if (!replay && this.active >= (this.options.capacity ?? 4)) throw new AppError('CAPACITY_REACHED', '阵容生成容量已满，请稍后重试', 429);
    const deadline = performance.now() + 60000;
    if (!replay) this.active++;
    let result: GenerationResult;
    try { result = this.storage(() => this.store.begin(discussionId, input, randomUUID(), new Date().toISOString())); }
    catch (error) { if (!replay) this.active--; throw error; }
    if (!result.replayed) {
      const controller = new AbortController();
      const task = this.run(result, controller.signal, deadline).catch(() => this.fail(result, 'LINEUP_STORAGE_FAILED'));
      this.tasks.set(task, controller);
      void task.then(() => { this.tasks.delete(task); this.active--; });
    } else if (!replay) this.active--;
    return result;
  }
  private diagnostic(result: GenerationResult, code: string): void {
    try { this.options.diagnose?.({ code, discussionId: result.discussionId, generationId: result.generationId }); }
    catch { /* A diagnostic sink cannot change a committed business outcome. */ }
  }
  private fail(result: GenerationResult, code: NoticeCode): void {
    try {
      if (!this.store.fail(result.discussionId, result, code, new Date().toISOString())) this.diagnostic(result, 'STALE_GENERATION_RESULT');
    } catch { this.unavailable.add(result.discussionId); this.diagnostic(result, 'STORAGE_UNAVAILABLE'); }
  }
  private attempt(result: GenerationResult, input: Parameters<RosterGenerator['generateRoster']>[0], signal: AbortSignal, deadline: number,
    repairIssues: {path:string;rule:string}[] | undefined): Promise<string> {
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean, value: unknown) => {
        if (settled) { this.diagnostic(result, 'STALE_GENERATION_RESULT'); return; }
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (ok && typeof value === 'string') resolve(value);
        else reject(ok ? new RosterValidationError('LINEUP_INVALID_STRUCTURE') : value);
      };
      const abort = () => { const error=new ProviderError(signal.aborted?'cancelled':'timeout');finish(false,error);controller.abort(error); };
      const timer = setTimeout(abort, Math.max(0, deadline - performance.now()));
      signal.addEventListener('abort', abort, {once:true});
      if (signal.aborted) { abort(); return; }
      try {
        void this.provider.generateRoster(input, { signal: controller.signal, deadline, generationId:result.generationId, ...(repairIssues ? {repairIssues} : {}) })
          .then(raw => finish(true, raw), error => finish(false, error));
      } catch (error) { finish(false, error); }
    });
  }
  private async run(result: GenerationResult, signal: AbortSignal, deadline: number): Promise<void> {
    const input = { discussionId: result.discussionId, topic: result.snapshot.topic, expertCount: result.snapshot.expertCount,
      constraints: '仅输出roles对象；每人仅role/name/profession/title/stance；恰好1 moderator及N expert；姓名64、职业/头衔80、立场200码点；不含系统字段或隐藏推理' };
    let repairIssues: {path:string;rule:string}[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let members: LineupMember[];
      try {
        const before=this.storage(()=>this.store.read(result.discussionId))?.snapshot;
        if(before?.status!=='generating_lineup'||before.lineupGeneration?.generationId!==result.generationId||before.lineupGeneration.generationVersion!==result.generationVersion){this.diagnostic(result,'STALE_GENERATION_RESULT');return;}
        const raw = await this.attempt(result,input,signal,Math.min(deadline,performance.now()+30000),repairIssues);
        let current: DiscussionSnapshot | undefined;
        try { current = this.store.read(result.discussionId)?.snapshot; }
        catch { this.fail(result,'LINEUP_STORAGE_FAILED'); return; }
        if (current?.status !== 'generating_lineup' || current.lineupGeneration?.generationId !== result.generationId || current.lineupGeneration.generationVersion !== result.generationVersion) {
          this.diagnostic(result,'STALE_GENERATION_RESULT'); return;
        }
        members = enrichRoster(parseRoster(raw,input.expertCount));
      } catch (error) {
        const code: NoticeCode = signal.aborted ? 'LINEUP_INTERRUPTED' : error instanceof RosterValidationError ? error.code : error instanceof ProviderError
          ? error.kind === 'configuration' ? 'LINEUP_PROVIDER_CONFIGURATION' : error.kind === 'timeout' ? 'LINEUP_TIMEOUT' : error.kind==='cancelled'?'LINEUP_INTERRUPTED':'LINEUP_PROVIDER_UNAVAILABLE'
          : 'LINEUP_PROVIDER_UNAVAILABLE';
        if (attempt === 1 || signal.aborted || performance.now() >= deadline || code === 'LINEUP_PROVIDER_CONFIGURATION'||error instanceof ProviderError&&!error.retryable) {
          this.fail(result,code); return;
        }
        repairIssues = error instanceof RosterValidationError ? [{path:'roles',rule:error.code}] : undefined;
        continue;
      }
      if (signal.aborted || performance.now() >= deadline) { this.fail(result,signal.aborted ? 'LINEUP_INTERRUPTED' : 'LINEUP_TIMEOUT'); return; }
      try {
        if (!this.store.complete(result.discussionId,result,members,new Date().toISOString(),deadline)) {
          if(performance.now()>=deadline) this.fail(result,'LINEUP_TIMEOUT');
          else this.diagnostic(result,'STALE_GENERATION_RESULT');
        }
      } catch { this.fail(result,'LINEUP_STORAGE_FAILED'); }
      return;
    }
  }
  async idle(): Promise<void> { await Promise.all(this.tasks.keys()); }
  confirm(id: unknown, body: unknown): { discussionId: string; snapshot: DiscussionSnapshot; replayed: boolean } {
    const discussionId=validateUuid(id), input=validateConfirm(body);this.assertAvailable(discussionId);
    return this.storage(()=>this.store.confirm(discussionId,input,new Date().toISOString()));
  }
  async close(): Promise<void> {
    this.closing = true; for (const controller of this.tasks.values()) controller.abort(); await this.idle();
  }
  recover(): void {
    if (this.active) throw new AppError('INVALID_STATE','生成任务运行时不能执行启动恢复',409);
    this.storage(() => this.store.recover(new Date().toISOString()));
    this.unavailable.clear();
  }
}
