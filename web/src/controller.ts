import type { Api, CreateInput, DraftListItem, DraftSnapshot } from './api.js';
import { ApiError, formInput, type GenerateInput } from './api.js';
export interface State {
  topic: string; count: string; busy: boolean; createError: string; saved: boolean;
  filter: 'active' | 'all'; items: DraftListItem[]; listLoading: boolean; listError: string;
  selectedId: string; detail: DraftSnapshot | null; detailLoading: boolean; detailError: string;
  panel: 'create' | 'list' | 'detail';
  actionBusy: boolean; actionError: string; syncNotice: string; checking: boolean; needsRefresh:boolean;
}
export class Controller {
  private state: State = { topic: '', count: '4', busy: false, createError: '', saved: false, filter: 'active',
    items: [], listLoading: false, listError: '', selectedId: '', detail: null, detailLoading: false, detailError: '', panel: 'create',
    actionBusy:false,actionError:'',syncNotice:'',checking:false,needsRefresh:false };
  private listeners = new Set<() => void>();
  private operation: Readonly<CreateInput> | undefined;
  private listVersion = 0;
  private detailVersion = 0;
  private generationOperation: GenerateInput | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pollAbort: AbortController | undefined;
  private pollVersion=0;
  private polls=0;
  private connected=true;
  private shown=true;
  private disposed=false;
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
      this.stopMonitor();this.polls=0;this.generationOperation=undefined;
      this.detailVersion++;
      this.update({ saved: true, detail: result.snapshot, selectedId: result.discussionId,
        detailLoading: false, detailError: '', panel: 'detail', filter: 'all',actionBusy:false,actionError:'',syncNotice:'',needsRefresh:false });
      this.schedule();
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
    this.disposed=false;this.stopMonitor();this.polls=0;this.generationOperation=undefined;
    const version = ++this.detailVersion;
    this.update({ selectedId: id, detail: null, detailLoading: true, detailError: '', panel: 'detail',actionBusy:false,actionError:'',syncNotice:'',checking:false,needsRefresh:false });
    try {
      const detail = await this.api.get(id);
      if (version === this.detailVersion) {this.update({ detail });this.schedule();}
    } catch (error) {
      if (version === this.detailVersion) this.update({ detailError: error instanceof Error ? error.message : '详情加载失败，请重新加载' });
    } finally { if (version === this.detailVersion) this.update({ detailLoading: false }); }
  }
  panel(panel: State['panel']) { this.update({ panel }); }
  private stopMonitor() {
    clearTimeout(this.timer);this.timer=undefined;this.pollVersion++;
    this.pollAbort?.abort();this.pollAbort=undefined;
    this.update({checking:false});
  }
  private adopt(detail:DraftSnapshot) {
    const old=this.state.detail;
    if(old?.discussionId===detail.discussionId && old.version>detail.version)return;
    if(detail.lineupGeneration&&this.generationOperation&&detail.lineupGeneration.generationId!==this.generationOperation.expectedGenerationId)this.generationOperation=undefined;
    this.update({detail,syncNotice:'',needsRefresh:false});
    if(old?.status==='generating_lineup'&&detail.status!=='generating_lineup')void this.loadList();
  }
  private schedule() {
    clearTimeout(this.timer);
    if(this.disposed||!this.shown||!this.connected||this.state.actionBusy||this.state.checking||this.state.detail?.status!=='generating_lineup')return;
    if(this.polls>=60){this.update({syncNotice:'状态获取超时，请重新检查'});return;}
    this.timer=setTimeout(()=>{this.polls++;void this.recheck();},2000);
  }
  async recheck(): Promise<void> {
    if(this.disposed||!this.connected||this.state.checking||this.state.actionBusy||!this.state.selectedId)return;
    clearTimeout(this.timer);const version=this.detailVersion,poll=++this.pollVersion;
    const abort=new AbortController();this.pollAbort=abort;this.update({checking:true});
    try {const detail=await this.api.get(this.state.selectedId,abort.signal);
      if(version===this.detailVersion&&poll===this.pollVersion)this.adopt(detail);
    } catch(error) {
      if(version===this.detailVersion&&poll===this.pollVersion)this.update({syncNotice:error instanceof ApiError&&error.status===0?'网络连接中断，正在等待恢复……':'状态读取失败，请重新检查'});
    } finally {
      if(version===this.detailVersion&&poll===this.pollVersion){this.pollAbort=undefined;this.update({checking:false});this.schedule();}
    }
  }
  async generate(): Promise<void> {await this.command('generate');}
  async confirm(): Promise<void> {await this.command('confirm');}
  private async command(kind:'generate'|'confirm') {
    const detail=this.state.detail;
    if(this.disposed||!this.connected||this.state.actionBusy||this.state.needsRefresh||!detail)return;
    if(kind==='confirm'?detail.status!=='awaiting_confirmation':!['created','awaiting_confirmation','lineup_generation_failed'].includes(detail.status))return;
    const version=this.detailVersion;this.stopMonitor();this.update({actionBusy:true,actionError:''});
    try {
      let result;
      if(kind==='confirm') {
        if(!detail.lineupGeneration)return;
        result=await this.api.confirm(detail.discussionId,{generationId:detail.lineupGeneration.generationId,lineupRevision:detail.lineupRevision});
      } else {
        this.generationOperation??={requestId:this.uuid(),expectedGenerationId:detail.lineupGeneration?.generationId??null};
        result=await this.api.generate(detail.discussionId,this.generationOperation);
      }
      if(version!==this.detailVersion)return;
      this.generationOperation=undefined;this.polls=0;this.adopt(result.snapshot);void this.loadList();
    } catch(error) {
      if(version!==this.detailVersion)return;
      if(error instanceof ApiError&&error.status===409) {
        this.generationOperation=undefined;
        this.update({actionError:'阵容已发生变化，请确认最新版本。',needsRefresh:true});
        try {const current=await this.api.get(detail.discussionId);if(version===this.detailVersion)this.adopt(current);}
        catch {if(version===this.detailVersion)this.update({syncNotice:'状态读取失败，请重新检查'});}
      } else this.update({actionError:kind==='confirm'?'确认失败，请重试。':'生成请求未确认，请重试或重新检查状态。'});
    } finally {
      if(version===this.detailVersion){this.update({actionBusy:false});this.schedule();}
    }
  }
  online(online:boolean): void {
    this.connected=online;
    if(!online){this.stopMonitor();this.update({syncNotice:'网络连接中断，正在等待恢复……'});}
    else {
      this.update({syncNotice:''});
      if(!this.shown||this.disposed)return;
      if(this.state.detail?.status==='generating_lineup'){
        if(this.polls>=60){this.update({syncNotice:'状态获取超时，请重新检查'});return;}
        this.polls++;
      }
      void this.recheck();
    }
  }
  visible(visible:boolean): void {this.shown=visible;if(!visible)this.stopMonitor();else this.schedule();}
  dispose(): void {this.disposed=true;this.detailVersion++;this.listVersion++;this.stopMonitor();}
}
