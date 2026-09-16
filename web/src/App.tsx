import { useEffect, useState, useSyncExternalStore } from 'react';
import { createApi, statusLabels } from './api.js';
import { Controller } from './controller.js';
import { LineupPanel } from './LineupPanel.js';
import './styles.css';

const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
export function App() {
  const [controller] = useState(() => new Controller(createApi()));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  useEffect(() => {
    void controller.loadList();
    const id=new URL(location.href).searchParams.get('discussion');
    if(id)void controller.select(id);
    const online=()=>controller.online(navigator.onLine);
    window.addEventListener('online',online);window.addEventListener('offline',online);
    if(!navigator.onLine)online();
    return ()=>{window.removeEventListener('online',online);window.removeEventListener('offline',online);controller.dispose();};
  }, [controller]);
  useEffect(()=>{
    if(state.selectedId){const url=new URL(location.href);url.searchParams.set('discussion',state.selectedId);history.replaceState(null,'',url);}
  },[state.selectedId]);
  useEffect(()=>{
    const visible=()=>controller.visible(document.visibilityState==='visible'&&(window.innerWidth>=900||state.panel==='detail'));
    visible();window.addEventListener('resize',visible);document.addEventListener('visibilitychange',visible);
    return ()=>{window.removeEventListener('resize',visible);document.removeEventListener('visibilitychange',visible);};
  },[controller,state.panel]);
  const detail = state.detail;
  const count = [...state.topic.trim()].length;
  return <div className="app-shell">
    <header className="masthead">
      <div className="brand-mark" aria-hidden="true">◎</div>
      <div><h1>圆桌工作台</h1><p>从一个值得讨论的话题开始</p></div>
      <span className="header-label">讨论准备</span>
    </header>
    <div className="workspace-heading"><div><h2>准备下一场讨论</h2><p>保存话题，整理想法。你的草稿随时可以回来查看。</p></div>
      <span className="stage-label">草稿工作区</span></div>
    {state.saved && <div className="success" role="status">草稿已保存{state.listError ? '；列表更新失败，请到讨论列表重新加载。' : '，已选中新建草稿。'}</div>}
    <nav className="mobile-nav" aria-label="区域选择">
      {([['create','新建讨论'],['list','讨论列表'],['detail','草稿详情']] as const).map(([key,label]) =>
        <button key={key} aria-pressed={state.panel === key} onClick={() => controller.panel(key)}>{label}</button>)}
    </nav>
    <main className="workspace" data-panel={state.panel}>
      <section className="pane create-pane" aria-labelledby="create-heading">
        <div className="pane-title"><h2 id="create-heading">新建讨论</h2><p>先确定话题与参与规模</p></div>
        <div className="pane-scroll">
          <form noValidate onSubmit={event => { event.preventDefault(); void controller.submit(); }}>
            <label htmlFor="topic">讨论话题</label>
            <textarea id="topic" value={state.topic} disabled={state.busy} aria-describedby="topic-help topic-count" aria-invalid={!!state.createError}
              placeholder="例如：AI 应该如何走进课堂？" onChange={event => controller.edit(event.target.value, state.count)} />
            <div className="field-meta"><span id="topic-help">具体的问题，有助于展开讨论</span><span id="topic-count" className={count > 500 ? 'invalid' : ''}>{count} / 500</span></div>
            <label htmlFor="count">专家人数</label>
            <select id="count" value={state.count} disabled={state.busy} aria-describedby="count-help" onChange={event => controller.edit(state.topic,event.target.value)}>
              <option value="">请选择人数</option>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} 位专家</option>)}
            </select>
            <p className="help" id="count-help">不包含主持人。阵容将在后续步骤生成。</p>
            {state.createError && <p className="error" role="alert">{state.createError}</p>}
            <button className="primary" type="submit" disabled={state.busy}>{state.busy ? '正在保存…' : state.createError ? '重试创建草稿' : '创建草稿'}</button>
            {state.createError && <p className="help">内容未修改时重试同一请求；修改内容后将新建草稿。结果不确定时，也可先查看全部讨论。</p>}
          </form>
          <aside className="note"><h3>把问题留在桌上</h3><p>草稿只保存话题与专家人数。此时还没有主持人、专家阵容或讨论内容。</p></aside>
        </div>
      </section>
      <section className="pane list-pane" aria-labelledby="list-heading">
        <div className="pane-title"><div className="title-row"><h2 id="list-heading">讨论列表</h2><button className="quiet" onClick={() => void controller.loadList()} disabled={state.listLoading}>重新加载列表</button></div>
          <div className="filters" aria-label="列表过滤">
            <button aria-pressed={state.filter === 'active'} onClick={() => void controller.loadList('active')}>进行中</button>
            <button aria-pressed={state.filter === 'all'} onClick={() => void controller.loadList('all')}>全部讨论</button>
          </div>
        </div>
        <div className="pane-scroll">
          {state.listLoading ? <p role="status" className="empty">正在读取讨论列表…</p> : state.listError ? <p className="error" role="alert">列表加载失败：{state.listError}</p> : state.items.length === 0 ?
            <div className="empty"><div className="empty-symbol" aria-hidden="true">◎</div><h3>{state.filter === 'active' ? '还没有进行中的讨论' : '还没有保存的讨论'}</h3><p>{state.filter === 'active' ? '草稿会保留在“全部讨论”中。' : '在新建讨论中保存你的第一个话题。'}</p></div> :
            <ul className="discussion-list">{state.items.map(item => <li key={item.discussionId} className={state.selectedId === item.discussionId ? 'selected' : ''}>
              <button className="item-title" aria-label={item.topic} aria-pressed={state.selectedId === item.discussionId} onClick={() => void controller.select(item.discussionId)}>{item.topic}</button>
              <div className="item-meta"><span className="badge">{statusLabels[item.status]}</span><span>{item.expertCount} 位专家</span></div><time dateTime={item.updatedAt}>更新于 {time(item.updatedAt)}</time>
            </li>)}</ul>}
        </div>
      </section>
      <section className="pane detail-pane" aria-labelledby="detail-heading">
        <div className="pane-title"><div className="title-row"><h2 id="detail-heading">草稿详情</h2>{state.selectedId && <button className="quiet" disabled={state.detailLoading} onClick={() => void controller.select(state.selectedId)}>重新加载详情</button>}</div><p>查看已保存的讨论准备</p></div>
        <div className="pane-scroll">
          {state.detailLoading ? <p className="empty" role="status">正在读取草稿…</p> : state.detailError ? <p className="error" role="alert">详情加载失败：{state.detailError}</p> : detail ? <>
            <div className="detail-state"><span className="badge">{statusLabels[detail.status]}</span><span>{detail.startedAt?'已开始的讨论记录':detail.status==='created'?'已保存':'讨论尚未开始'}</span></div>
            <h3 className="topic-title">{detail.topic}</h3>
            <dl className="metadata"><div><dt>专家人数</dt><dd>{detail.expertCount} 位专家（不含主持人）</dd></div>
              <div><dt>创建时间</dt><dd>{time(detail.createdAt)}</dd></div><div><dt>更新时间</dt><dd>{time(detail.updatedAt)}</dd></div></dl>
            <LineupPanel snapshot={detail} busy={state.actionBusy} error={state.actionError} notice={state.syncNotice} checking={state.checking} blocked={state.needsRefresh}
              generate={()=>void controller.generate()} confirm={()=>void controller.confirm()} recheck={()=>void controller.recheck()}/>
          </> : <div className="empty"><div className="empty-symbol" aria-hidden="true">▤</div><h3>选一条草稿，继续整理想法</h3><p>从列表中选择讨论，或先创建一个新话题。</p></div>}
        </div>
      </section>
    </main>
    <footer>圆桌讨论 · 草稿准备</footer>
  </div>;
}
