import type { DraftSnapshot } from './api.js';
export interface LineupPanelProps {
  snapshot:DraftSnapshot;busy:boolean;error:string;notice:string;checking:boolean;
  generate:()=>void;confirm:()=>void;recheck:()=>void;blocked?:boolean;
}
export function LineupPanel({snapshot,busy,error,notice,checking,generate,confirm,recheck,blocked=false}:LineupPanelProps){
  const ready=snapshot.status==='awaiting_confirmation',confirmed=snapshot.status==='lineup_confirmed';
  const offline=notice.startsWith('网络连接中断');
  return <section className="lineup-panel" aria-label="讨论阵容" aria-busy={busy}>
    <h3>讨论阵容</h3>
    <p className="help">当前为演示阵容（Fake Provider），角色为虚构，不代表真实人物观点。</p>
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<div className="sync-notice"><p role="status">{notice}</p><button disabled={checking||busy||offline} onClick={recheck}>重新检查状态</button></div>}
    {snapshot.status==='created'&&<div className="lineup-empty"><h3>阵容尚未生成</h3><p>根据当前话题生成一位主持人与{snapshot.expertCount}位专家，再由你确认。</p><button className="primary" disabled={busy||offline} onClick={generate}>{busy?'正在提交…':'生成阵容'}</button></div>}
    {snapshot.status==='generating_lineup'&&<p className="lineup-progress" role="status">正在生成主持人与专家阵容……</p>}
    {snapshot.status==='lineup_generation_failed'&&<div className="lineup-empty"><h3>阵容生成失败</h3><p>{snapshot.lastNotice?.message}</p><button className="primary" disabled={busy||offline} onClick={generate}>{busy?'正在提交…':'重试生成'}</button></div>}
    {ready&&<><p className="lineup-caption">{blocked?'阵容状态尚未同步，请先重新检查。':'阵容尚未确认，请查看成员与立场。'}</p><div className="lineup-actions"><button className="primary" disabled={busy||offline||blocked} onClick={confirm}>确认阵容</button><button disabled={busy||offline||blocked} onClick={generate}>重新生成</button></div>{busy&&<p role="status">正在提交…</p>}</>}
    {confirmed&&<p className="confirmed-notice" role="status">阵容已确认，讨论功能将在后续阶段启用。</p>}
    {(ready||confirmed)&&<div className="member-grid">{snapshot.roles.map(member=><article className={`member-card ${member.role==='moderator'?'moderator':''}`} key={member.memberId} aria-label={`${member.role==='moderator'?'主持人':'专家'}：${member.name}`}>
      <div className="member-role"><span className="member-color" style={{backgroundColor:member.color}} aria-hidden="true"/>{member.role==='moderator'?'主持人':'专家'}</div>
      <h4>{member.name}</h4><dl><div><dt>职业</dt><dd>{member.profession}</dd></div><div><dt>头衔</dt><dd>{member.title}</dd></div><div><dt>{member.role==='moderator'?'主持原则':'立场'}</dt><dd>{member.stance}</dd></div></dl>
    </article>)}</div>}
  </section>;
}
