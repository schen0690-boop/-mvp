import type { DatabaseSync } from 'node:sqlite';
import type { CreateDraftInput } from '../domain/input.js';
import type { DraftRecord, DraftStore } from '../domain/drafts.js';
import { isObject } from '../domain/input.js';
import { AppError } from '../domain/errors.js';
import { readSnapshot } from './read-discussion.js';

export class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: DatabaseSync) {}
  create(input: CreateDraftInput, id: string, timestamp: string): { record: DraftRecord; replayed: boolean } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT * FROM discussions WHERE create_request_id = ?').get(input.requestId);
      if (previous) {
        const record = readRecord(previous);
        // The normalized topic/count pair is the stored idempotency fingerprint.
        if (record.topic !== input.topic || record.expertCount !== input.expertCount) {
          throw new AppError('IDEMPOTENCY_CONFLICT', '该请求标识已用于不同的创建内容', 409);
        }
        this.db.exec('COMMIT');
        return { record, replayed: true };
      }
      this.db.prepare(`INSERT INTO discussions
        (id, topic, expert_count, status, version, last_event_id, create_request_id, created_at, updated_at)
        VALUES (?, ?, ?, 'created', 1, 1, ?, ?, ?)`)
        .run(id, input.topic, input.expertCount, input.requestId, timestamp, timestamp);
      const payload = JSON.stringify({ status: 'created', stopReason: null, startedAt: null,
        endedAt: null, confirmedLineupRevision: null, summary: null });
      this.db.prepare(`INSERT INTO public_events
        (discussion_id, event_id, data_version, type, occurred_at, payload)
        VALUES (?, 1, 1, 'discussion.status_changed', ?, ?)`)
        .run(id, timestamp, payload);
      const record = readRecord(this.db.prepare('SELECT * FROM discussions WHERE id = ?').get(id));
      this.db.exec('COMMIT');
      return { record, replayed: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  get(id: string): DraftRecord | undefined {
    const row = this.db.prepare('SELECT * FROM discussions WHERE id = ?').get(id);
    return row ? readRecord(row) : undefined;
  }
  snapshot(id: string) { return readSnapshot(this.db, id); }
  list(status: 'active' | 'all'): DraftRecord[] {
    return this.db.prepare(`SELECT * FROM discussions
      WHERE ? = 'all' OR status IN ('generating_lineup', 'awaiting_confirmation', 'running', 'stopping')
      ORDER BY updated_at DESC, id ASC`).all(status).map(readRecord);
  }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function readRecord(row: unknown): DraftRecord {
  if (!isObject(row) || typeof row.id !== 'string' || typeof row.topic !== 'string' ||
      typeof row.expert_count !== 'number' || !Number.isInteger(row.expert_count) || row.expert_count < 1 || row.expert_count > 8 ||
      !['created', 'generating_lineup', 'awaiting_confirmation', 'lineup_generation_failed', 'lineup_confirmed'].includes(String(row.status)) ||
      typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 ||
      typeof row.last_event_id !== 'number' || !Number.isSafeInteger(row.last_event_id) || row.last_event_id < 1 ||
      !isTimestamp(row.created_at) || !isTimestamp(row.updated_at)) {
    throw new Error('INVALID_STORED_DRAFT');
  }
  if (row.status !== 'created' && row.status !== 'generating_lineup' && row.status !== 'awaiting_confirmation' && row.status !== 'lineup_generation_failed' && row.status !== 'lineup_confirmed') throw new Error('INVALID_STORED_STATUS');
  return { discussionId: row.id, topic: row.topic, expertCount: row.expert_count,
    status: row.status, version: row.version, lastEventId: row.last_event_id,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
