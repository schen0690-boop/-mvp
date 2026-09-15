import type { CreateDraftInput } from './input.js';
import { validateCreateDraft, validateUuid } from './input.js';
import { AppError, invalidInput } from './errors.js';
import { randomUUID } from 'node:crypto';

export interface DraftRecord {
  discussionId: string;
  topic: string;
  expertCount: number;
  status: 'created';
  version: 1;
  lastEventId: 1;
  createdAt: string;
  updatedAt: string;
}

export interface DraftSnapshot extends DraftRecord {
  lineupRevision: 0;
  confirmedLineupRevision: null;
  transcriptVersion: 0;
  roles: never[];
  utterances: never[];
  synthesis: null;
  summary: null;
  lastNotice: null;
  stopReason: null;
  startedAt: null;
  endedAt: null;
}

export type DraftListItem = Pick<DraftRecord, 'discussionId' | 'topic' | 'expertCount' | 'status' | 'version' | 'updatedAt'>;
export interface DraftStore {
  create(input: CreateDraftInput, id: string, timestamp: string): { record: DraftRecord; replayed: boolean };
  get(id: string): DraftRecord | undefined;
  list(status: 'active' | 'all'): DraftRecord[];
}

export class DraftService {
  constructor(private readonly store: DraftStore, private readonly now: () => Date = () => new Date()) {}

  create(input: unknown): { discussionId: string; snapshot: DraftSnapshot; replayed: boolean } {
    const validated = validateCreateDraft(input);
    const { record, replayed } = this.store.create(validated, randomUUID(), this.now().toISOString());
    return { discussionId: record.discussionId, snapshot: snapshotOf(record), replayed };
  }

  get(id: unknown): DraftSnapshot {
    const record = this.store.get(validateUuid(id));
    if (!record) throw new AppError('NOT_FOUND', '未找到讨论', 404);
    return snapshotOf(record);
  }

  list(status: unknown = 'active'): { items: DraftListItem[] } {
    if (status !== 'active' && status !== 'all') invalidInput('列表状态只允许active或all');
    return { items: this.store.list(status).map(record => ({
      discussionId: record.discussionId, topic: record.topic, expertCount: record.expertCount,
      status: record.status, version: record.version, updatedAt: record.updatedAt
    })) };
  }
}

function snapshotOf(record: DraftRecord): DraftSnapshot {
  return {
    discussionId: record.discussionId, topic: record.topic, expertCount: record.expertCount,
    status: record.status, version: record.version, lastEventId: record.lastEventId,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
    lineupRevision: 0, confirmedLineupRevision: null, transcriptVersion: 0,
    roles: [], utterances: [], synthesis: null, summary: null, lastNotice: null,
    stopReason: null, startedAt: null, endedAt: null
  };
}
