import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { DiscussionSnapshot } from '../domain/snapshot.js';
import { noticeMessages, noticeOf } from '../domain/snapshot.js';
import { parseRoster } from '../domain/lineup.js';
import { isRuntimeStatus } from '../domain/snapshot.js';
import { readRuntime } from './read-runtime.js';
export function transaction<T>(db: DatabaseSync, fn: () => T, write = true): T {
  if (db.isTransaction) return fn();
  db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
export function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('INVALID_STORED_TEXT'); return value;
}
export function integer(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('INVALID_STORED_INTEGER'); return value;
}
export function nullableText(value: SQLOutputValue | undefined): string | null { return value === null ? null : text(value); }
export function readSnapshot(db: DatabaseSync, id: string): DiscussionSnapshot | undefined {
  return transaction(db, () => {
    const r = db.prepare('SELECT * FROM discussions WHERE id=?').get(id); if (!r) return undefined;
    const status = r.status;
    if (status !== 'created' && status !== 'generating_lineup' && status !== 'awaiting_confirmation' && status !== 'lineup_generation_failed' && status !== 'lineup_confirmed' && !isRuntimeStatus(status)) throw new Error('INVALID_STORED_STATUS');
    const snapshot: DiscussionSnapshot = {
      discussionId: text(r.id), topic: text(r.topic), expertCount: integer(r.expert_count), status,
      version: integer(r.version), lastEventId: integer(r.last_event_id), createdAt: text(r.created_at), updatedAt: text(r.updated_at),
      lineupRevision: integer(r.lineup_revision), confirmedLineupRevision: r.confirmed_lineup_revision === null ? null : integer(r.confirmed_lineup_revision),
      transcriptVersion: 0, roles: [], utterances: [], synthesis: null, summary: null, lastNotice: null, stopReason: null, startedAt: null, endedAt: null
    };
    if (status === 'created') return snapshot;
    snapshot.lineupGeneration = { generationId: text(r.current_generation_id), generationVersion: integer(r.generation_version), startedAt: text(r.generation_started_at), finishedAt: nullableText(r.generation_finished_at) };
    snapshot.confirmedAt = nullableText(r.confirmed_at);
    if (status === 'lineup_generation_failed') {
      const code = text(r.lineup_error_code);
      if (!(code in noticeMessages)) throw new Error('INVALID_STORED_NOTICE');
      // Only names from the closed table are eligible, never provider text.
      const entry = Object.entries(noticeMessages).find(([key]) => key === code);
      if (!entry) throw new Error('INVALID_STORED_NOTICE');
      for (const key of Object.keys(noticeMessages) as (keyof typeof noticeMessages)[]) if (key === code) snapshot.lastNotice = noticeOf(key);
    }
    if (status === 'awaiting_confirmation' || status === 'lineup_confirmed' || isRuntimeStatus(status)) {
      const rows = db.prepare('SELECT * FROM lineup_members WHERE discussion_id=? AND generation_id=? AND generation_version=? ORDER BY display_order').all(id, text(r.current_generation_id), integer(r.generation_version));
      const candidates = parseRoster(JSON.stringify({ roles: rows.map(m => ({ role: m.role, name: m.name, profession: m.profession, title: m.title, stance: m.stance })) }), snapshot.expertCount);
      snapshot.roles = rows.map((m, i) => {
        const candidate = candidates[i]; if (!candidate) throw new Error('INVALID_STORED_MEMBERS');
        return { ...candidate, memberId: text(m.member_id), color: text(m.color), displayOrder: integer(m.display_order) };
      });
    }
    if(isRuntimeStatus(status))readRuntime(db,r,snapshot);
    return snapshot;
  }, false);
}
