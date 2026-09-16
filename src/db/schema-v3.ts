// Immutable migration 003: preserves every 002 column and historical event.
export const schemaV3 = `
CREATE TABLE discussions_new (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK(length(CAST(topic AS BLOB)) BETWEEN 1 AND 2000),
  expert_count INTEGER NOT NULL CHECK(expert_count BETWEEN 1 AND 8),
  status TEXT NOT NULL CHECK(status IN ('created','generating_lineup','awaiting_confirmation','lineup_generation_failed','lineup_confirmed','running','stopping','completed','failed','running','stopping','completed','failed')),
  version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  last_event_id INTEGER NOT NULL CHECK(last_event_id BETWEEN 1 AND 9007199254740991),
  create_request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  current_generation_id TEXT UNIQUE, generation_request_id TEXT, generation_base_id TEXT,
  generation_version INTEGER NOT NULL DEFAULT 0 CHECK(generation_version BETWEEN 0 AND 9007199254740991),
  generation_started_at TEXT, generation_finished_at TEXT,
  lineup_generation_id TEXT,
  lineup_revision INTEGER NOT NULL DEFAULT 0 CHECK(lineup_revision BETWEEN 0 AND generation_version),
  confirmed_lineup_revision INTEGER, confirmed_at TEXT, lineup_error_code TEXT,
  run_id TEXT UNIQUE, start_request_id TEXT, run_epoch INTEGER NOT NULL DEFAULT 0 CHECK(run_epoch>=0),
  started_at TEXT, run_deadline_at TEXT, stopping_at TEXT, stop_deadline_at TEXT, ended_at TEXT,
  stop_reason TEXT CHECK(stop_reason IN ('user_requested','turn_limit','duration_limit','no_participation','synthesis_unavailable','call_budget_exhausted')),
  runtime_notice_code TEXT,
  transcript_version INTEGER NOT NULL DEFAULT 0 CHECK(transcript_version BETWEEN 0 AND 9007199254740991),
  expert_turn_count INTEGER NOT NULL DEFAULT 0 CHECK(expert_turn_count BETWEEN 0 AND 12),
  call_limit INTEGER NOT NULL DEFAULT 0 CHECK(call_limit BETWEEN 0 AND 280),
  calls_used INTEGER NOT NULL DEFAULT 0 CHECK(calls_used BETWEEN 0 AND call_limit),
  summary_calls_used INTEGER NOT NULL DEFAULT 0 CHECK(summary_calls_used BETWEEN 0 AND 2 AND summary_calls_used<=calls_used),
  frozen_transcript_version INTEGER, synthesis_source_version INTEGER, synthesis_updated_at TEXT,
  synthesis_state TEXT NOT NULL DEFAULT 'idle' CHECK(synthesis_state IN ('idle','preparing','ready','failed')),
  summary_json TEXT CHECK(summary_json IS NULL OR json_valid(summary_json)),
  UNIQUE(id,run_id),
  CHECK(last_event_id>=version),
  CHECK((status NOT IN ('running','stopping','completed','failed') AND run_id IS NULL AND started_at IS NULL AND ended_at IS NULL AND run_epoch=0 AND transcript_version=0 AND calls_used=0)
   OR (status IN ('running','stopping','completed','failed') AND run_id IS NOT NULL AND start_request_id IS NOT NULL AND started_at IS NOT NULL AND run_deadline_at IS NOT NULL AND run_epoch>0 AND call_limit=28*expert_count+56)),
  CHECK(status NOT IN ('running','stopping') OR ended_at IS NULL),
  CHECK(status<>'stopping' OR (stopping_at IS NOT NULL AND stop_deadline_at IS NOT NULL AND frozen_transcript_version IS NOT NULL AND frozen_transcript_version=transcript_version)),
  CHECK(status NOT IN ('completed','failed') OR ended_at IS NOT NULL),
  CHECK(status<>'completed' OR (summary_json IS NOT NULL AND json_extract(summary_json,'$.status') IS NOT NULL AND json_extract(summary_json,'$.status') IN ('ready','unavailable'))),
  CHECK(status<>'failed' OR runtime_notice_code IS NOT NULL),
  UNIQUE(id,lineup_generation_id,lineup_revision),
  CHECK((lineup_revision=0 AND lineup_generation_id IS NULL) OR (lineup_revision>0 AND lineup_generation_id IS NOT NULL)),
  CHECK((generation_version=0 AND current_generation_id IS NULL AND generation_request_id IS NULL AND generation_base_id IS NULL AND generation_started_at IS NULL AND generation_finished_at IS NULL)
    OR (generation_version>0 AND current_generation_id IS NOT NULL AND generation_request_id IS NOT NULL AND generation_started_at IS NOT NULL)),
  CHECK((status='created' AND generation_version=0 AND lineup_revision=0 AND version=1 AND last_event_id=1)
    OR (status<>'created' AND generation_version>0)),
  CHECK((status='generating_lineup' AND generation_finished_at IS NULL)
    OR (status='created' AND generation_finished_at IS NULL)
    OR (status IN ('awaiting_confirmation','lineup_generation_failed','lineup_confirmed','running','stopping','completed','failed') AND generation_finished_at IS NOT NULL)),
  CHECK(status NOT IN ('awaiting_confirmation','lineup_confirmed','running','stopping','completed','failed') OR
    (lineup_generation_id IS NOT NULL AND lineup_generation_id=current_generation_id AND lineup_revision=generation_version)),
  CHECK((status IN ('lineup_confirmed','running','stopping','completed','failed') AND confirmed_at IS NOT NULL AND confirmed_lineup_revision IS NOT NULL AND confirmed_lineup_revision=lineup_revision)
    OR (status NOT IN ('lineup_confirmed','running','stopping','completed','failed') AND confirmed_at IS NULL AND confirmed_lineup_revision IS NULL)),
  CHECK((status='lineup_generation_failed' AND lineup_error_code IS NOT NULL AND lineup_error_code IN (
    'LINEUP_PROVIDER_UNAVAILABLE','LINEUP_PROVIDER_CONFIGURATION','LINEUP_TIMEOUT','LINEUP_INVALID_STRUCTURE',
    'LINEUP_INVALID_MEMBERS','LINEUP_STORAGE_FAILED','LINEUP_INTERRUPTED')) OR
    (status<>'lineup_generation_failed' AND lineup_error_code IS NULL))
) STRICT;
INSERT INTO discussions_new (id,topic,expert_count,status,version,last_event_id,create_request_id,created_at,updated_at,current_generation_id,generation_request_id,generation_base_id,generation_version,generation_started_at,generation_finished_at,lineup_generation_id,lineup_revision,confirmed_lineup_revision,confirmed_at,lineup_error_code) SELECT id,topic,expert_count,status,version,last_event_id,create_request_id,created_at,updated_at,current_generation_id,generation_request_id,generation_base_id,generation_version,generation_started_at,generation_finished_at,lineup_generation_id,lineup_revision,confirmed_lineup_revision,confirmed_at,lineup_error_code FROM discussions;
DROP TABLE discussions;
ALTER TABLE discussions_new RENAME TO discussions;
CREATE UNIQUE INDEX lineup_member_identity ON lineup_members(discussion_id,member_id);
CREATE TABLE events_new (
 discussion_id TEXT NOT NULL REFERENCES discussions(id), event_id INTEGER NOT NULL CHECK(event_id>0), data_version INTEGER NOT NULL CHECK(data_version>0),
 type TEXT NOT NULL CHECK(type IN ('discussion.status_changed','role.status_changed','utterance.created','synthesis.status_changed','synthesis.updated','summary.ready','discussion.notice')),
 occurred_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(discussion_id,event_id)
) STRICT;
INSERT INTO events_new SELECT * FROM public_events;
DROP TABLE public_events;
ALTER TABLE events_new RENAME TO public_events;
CREATE TABLE utterances (
 id TEXT PRIMARY KEY NOT NULL, discussion_id TEXT NOT NULL, run_id TEXT NOT NULL, role_id TEXT NOT NULL,
 seq INTEGER NOT NULL CHECK(seq>0), sentences_json TEXT NOT NULL CHECK(json_valid(sentences_json)), reply_ids_json TEXT NOT NULL CHECK(json_valid(reply_ids_json)), created_at TEXT NOT NULL,
 UNIQUE(discussion_id,id), UNIQUE(discussion_id,seq), FOREIGN KEY(discussion_id,run_id) REFERENCES discussions(id,run_id),
 FOREIGN KEY(discussion_id,role_id) REFERENCES lineup_members(discussion_id,member_id)
) STRICT;
CREATE TABLE findings (
 id TEXT PRIMARY KEY NOT NULL, discussion_id TEXT NOT NULL, run_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('consensus','disagreement')),
 text TEXT NOT NULL, positions_json TEXT NOT NULL CHECK(json_valid(positions_json)), source_transcript_version INTEGER NOT NULL CHECK(source_transcript_version>0),
 UNIQUE(discussion_id,id), FOREIGN KEY(discussion_id,run_id) REFERENCES discussions(id,run_id)
) STRICT;
CREATE TABLE finding_evidence (
 discussion_id TEXT NOT NULL, finding_id TEXT NOT NULL, utterance_id TEXT NOT NULL, position_index INTEGER NOT NULL CHECK(position_index BETWEEN 0 AND 2),
 PRIMARY KEY(discussion_id,finding_id,utterance_id,position_index),
 FOREIGN KEY(discussion_id,finding_id) REFERENCES findings(discussion_id,id), FOREIGN KEY(discussion_id,utterance_id) REFERENCES utterances(discussion_id,id)
) STRICT;
CREATE TABLE role_public_states (
 discussion_id TEXT NOT NULL, member_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('idle','preparing','speaking')),
 public_focus TEXT, focus_source_transcript_version INTEGER, updated_at TEXT NOT NULL,
 PRIMARY KEY(discussion_id,member_id), FOREIGN KEY(discussion_id,member_id) REFERENCES lineup_members(discussion_id,member_id),
 CHECK((public_focus IS NULL AND focus_source_transcript_version IS NULL) OR (public_focus IS NOT NULL AND focus_source_transcript_version IS NOT NULL AND focus_source_transcript_version>=0))
) STRICT;
`;
