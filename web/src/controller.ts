import type { Api, CreateInput, DraftListItem, DraftSnapshot } from './api.js';
import { formInput } from './api.js';
export interface State {
  topic: string; count: string; busy: boolean; createError: string; saved: boolean;
  filter: 'active' | 'all'; items: DraftListItem[]; listLoading: boolean; listError: string;
  selectedId: string; detail: DraftSnapshot | null; detailLoading: boolean; detailError: string;
  panel: 'create' | 'list' | 'detail';
}
export class Controller {
  private state: State = { topic: '', count: '4', busy: false, createError: '', saved: false, filter: 'active',
    items: [], listLoading: false, listError: '', selectedId: '', detail: null, detailLoading: false, detailError: '', panel: 'create' };
  private listeners = new Set<() => void>();
  private operation: Readonly<CreateInput> | undefined;
  private listVersion = 0;
  private detailVersion = 0;
  constructor(private readonly api: Api, private readonly uuid: () => string = () => crypto.randomUUID()) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  edit(topic: string, count: string) {
    if (this.state.busy) return;
    if (topic !== this.state.topic || count !== this.state.count) this.operation = undefined;
    this.update({ topic, count, saved: false, createError: '' });
  }
  async submit(): Promise<void> {
    if (this.state.busy) return;
    this.update({ busy: true, createError: '', saved: false });
    try {
      this.operation ??= Object.freeze(formInput(this.state.topic, this.state.count, this.uuid()));
      const result = await this.api.create(this.operation);
      this.operation = undefined;
      this.detailVersion++;
      this.update({ saved: true, detail: result.snapshot, selectedId: result.discussionId,
        detailLoading: false, detailError: '', panel: 'detail', filter: 'all' });
      await this.loadList('all');
    } catch (error) {
      this.update({ createError: error instanceof Error ? error.message : '创建结果未确认，请重试原请求' });
    } finally { this.update({ busy: false }); }
  }
  async loadList(filter: 'active' | 'all' = this.state.filter): Promise<void> {
    const version = ++this.listVersion;
    this.update({ filter, listLoading: true, listError: '', items: [] });
    try {
      const items = await this.api.list(filter);
      if (version === this.listVersion) this.update({ items });
    } catch (error) {
      if (version === this.listVersion) this.update({ listError: error instanceof Error ? error.message : '列表加载失败，请重新加载' });
    } finally { if (version === this.listVersion) this.update({ listLoading: false }); }
  }
  async select(id: string): Promise<void> {
    const version = ++this.detailVersion;
    this.update({ selectedId: id, detail: null, detailLoading: true, detailError: '', panel: 'detail' });
    try {
      const detail = await this.api.get(id);
      if (version === this.detailVersion) this.update({ detail });
    } catch (error) {
      if (version === this.detailVersion) this.update({ detailError: error instanceof Error ? error.message : '详情加载失败，请重新加载' });
    } finally { if (version === this.detailVersion) this.update({ detailLoading: false }); }
  }
  panel(panel: State['panel']) { this.update({ panel }); }
}
