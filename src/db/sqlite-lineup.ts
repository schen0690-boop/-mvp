import type { DatabaseSync } from 'node:sqlite';
import type { GenerationKey, GenerationResult, LineupStore, StoredDiscussion } from '../domain/lineup-service.js';
import { generationDecision } from '../domain/lineup-service.js';
import type { LineupMember } from '../domain/lineup.js';
import { nameKey } from '../domain/lineup.js';
import type { NoticeCode } from '../domain/snapshot.js';
import { AppError } from '../domain/errors.js';
import { readSnapshot, transaction, nullableText, text, integer } from './read-discussion.js';
export class SqliteLineupStore implements LineupStore {
  constructor(private readonly db: DatabaseSync) {}
  read(id: string): StoredDiscussion | undefined {
    return transaction(this.db, () => {
      const snapshot = readSnapshot(this.db, id); if (!snapshot) return undefined;
      const row = this.db.prepare('SELECT generation_request_id,generation_base_id FROM discussions WHERE id=?').get(id);
      if (!row) throw new Error('MISSING_DISCUSSION');
      return { snapshot, requestId: nullableText(row.generation_request_id), baseId: nullableText(row.generation_base_id) };
    }, false);
  }
  begin(id: string, input: { requestId: string; expectedGenerationId: string | null }, generationId: string, time: string): GenerationResult {
    return transaction(this.db, () => {
      const record = this.read(id); if (!record) throw new AppError('NOT_FOUND', '未找到讨论', 404);
      const replayed = generationDecision(record, input) === 'replay';
      if (!replayed) {
        this.db.prepare(`UPDATE discussions SET status='generating_lineup',current_generation_id=?,generation_request_id=?,generation_base_id=?,
          generation_version=generation_version+1,generation_started_at=?,generation_finished_at=NULL,lineup_error_code=NULL,
          version=version+1,last_event_id=last_event_id+1,updated_at=? WHERE id=?`)
          .run(generationId, input.requestId, input.expectedGenerationId, time, time, id);
        this.event(id);
      }
      const snapshot = this.read(id)?.snapshot; const generation = snapshot?.lineupGeneration;
      if (!snapshot || !generation) throw new Error('MISSING_GENERATION');
      return { discussionId: id, generationId: generation.generationId, generationVersion: generation.generationVersion, snapshot, replayed };
    });
  }
  private current(id: string, key: GenerationKey): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM discussions WHERE id=? AND current_generation_id=? AND generation_version=? AND status='generating_lineup'").get(id, key.generationId, key.generationVersion));
  }
  complete(id: string, key: GenerationKey, members: LineupMember[], time: string, deadline = Infinity): boolean {
    const expired = new Error('GENERATION_DEADLINE_EXCEEDED');
    try { return transaction(this.db, () => {
      if (performance.now() >= deadline) return false;
      if (!this.current(id, key)) return false;
      const previous = this.db.prepare('SELECT lineup_generation_id FROM discussions WHERE id=?').get(id);
      if (previous?.lineup_generation_id !== null && previous?.lineup_generation_id !== undefined) {
        this.db.prepare('DELETE FROM lineup_members WHERE discussion_id=? AND generation_id=?').run(id, text(previous.lineup_generation_id));
      }
      this.db.prepare(`UPDATE discussions SET status='awaiting_confirmation',lineup_generation_id=?,lineup_revision=?,generation_finished_at=?,
        version=version+1,last_event_id=last_event_id+1,updated_at=? WHERE id=?`).run(key.generationId,key.generationVersion,time,time,id);
      const insert = this.db.prepare(`INSERT INTO lineup_members (member_id,discussion_id,generation_id,generation_version,role,name,profession,title,stance,color,display_order,name_key,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const m of members) insert.run(m.memberId,id,key.generationId,key.generationVersion,m.role,m.name,m.profession,m.title,m.stance,m.color,m.displayOrder,nameKey(m.name),time);
      this.event(id);
      if (performance.now() >= deadline) throw expired;
      return true;
    }); } catch(error) { if(error===expired) return false;throw error; }
  }
  fail(id: string, key: GenerationKey, code: NoticeCode, time: string): boolean {
    return transaction(this.db, () => {
      if (!this.current(id,key)) return false;
      this.db.prepare(`UPDATE discussions SET status='lineup_generation_failed',lineup_error_code=?,generation_finished_at=?,
        version=version+1,last_event_id=last_event_id+1,updated_at=? WHERE id=?`).run(code,time,time,id);
      this.event(id); return true;
    });
  }
  recover(time: string): void {
    transaction(this.db, () => {
      const rows=this.db.prepare("SELECT id,current_generation_id,generation_version FROM discussions WHERE status='generating_lineup'").all();
      for(const r of rows) this.fail(text(r.id),{generationId:text(r.current_generation_id),generationVersion:integer(r.generation_version)},'LINEUP_INTERRUPTED',time);
    });
  }
  confirm(id: string, input: { generationId: string; lineupRevision: number }, time: string) {
    return transaction(this.db,()=>{
      const record=this.read(id);if(!record) throw new AppError('NOT_FOUND','未找到讨论',404);
      const s=record.snapshot;
      if(s.status!=='awaiting_confirmation' && s.status!=='lineup_confirmed') throw new AppError('LINEUP_NOT_READY','阵容尚未就绪，无法确认',409);
      if(s.lineupGeneration?.generationId!==input.generationId || s.lineupRevision!==input.lineupRevision || s.lineupGeneration.generationVersion!==input.lineupRevision) throw new AppError('STALE_LINEUP','阵容版本已更新，请刷新',409);
      const replayed=s.status==='lineup_confirmed';
      if(!replayed){
        this.db.prepare(`UPDATE discussions SET status='lineup_confirmed',confirmed_lineup_revision=lineup_revision,confirmed_at=?,
          version=version+1,last_event_id=last_event_id+1,updated_at=? WHERE id=?`).run(time,time,id);
        this.event(id);
      }
      const snapshot=this.read(id)?.snapshot;if(!snapshot) throw new Error('MISSING_DISCUSSION');
      return {discussionId:id,snapshot,replayed};
    });
  }
  private event(id: string): void {
    const s = readSnapshot(this.db, id); if (!s) throw new Error('MISSING_DISCUSSION');
    const payload = { status: s.status, stopReason: s.stopReason, startedAt: s.startedAt, endedAt: s.endedAt,
      confirmedLineupRevision: s.confirmedLineupRevision, summary: s.summary, lineupRevision: s.lineupRevision,
      lineupGeneration: s.lineupGeneration, confirmedAt: s.confirmedAt, roles: s.roles, lastNotice: s.lastNotice };
    this.db.prepare(`INSERT INTO public_events (discussion_id,event_id,data_version,type,occurred_at,payload) VALUES (?,?,?,'discussion.status_changed',?,?)`)
      .run(id,s.lastEventId,s.version,s.updatedAt,JSON.stringify(payload));
  }
}
