// Immutable migration 002, independent of evolving domain constants.
export const schemaV2 = `
CREATE TABLE discussions_new (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK(length(CAST(topic AS BLOB)) BETWEEN 1 AND 2000),
  expert_count INTEGER NOT NULL CHECK(expert_count BETWEEN 1 AND 8),
  status TEXT NOT NULL CHECK(status IN ('created','generating_lineup','awaiting_confirmation','lineup_generation_failed','lineup_confirmed')),
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
  UNIQUE(id,lineup_generation_id,lineup_revision),
  CHECK((lineup_revision=0 AND lineup_generation_id IS NULL) OR (lineup_revision>0 AND lineup_generation_id IS NOT NULL)),
  CHECK((generation_version=0 AND current_generation_id IS NULL AND generation_request_id IS NULL AND generation_base_id IS NULL AND generation_started_at IS NULL AND generation_finished_at IS NULL)
    OR (generation_version>0 AND current_generation_id IS NOT NULL AND generation_request_id IS NOT NULL AND generation_started_at IS NOT NULL)),
  CHECK((status='created' AND generation_version=0 AND lineup_revision=0 AND version=1 AND last_event_id=1)
    OR (status<>'created' AND generation_version>0)),
  CHECK((status='generating_lineup' AND generation_finished_at IS NULL)
    OR (status='created' AND generation_finished_at IS NULL)
    OR (status IN ('awaiting_confirmation','lineup_generation_failed','lineup_confirmed') AND generation_finished_at IS NOT NULL)),
  CHECK(status NOT IN ('awaiting_confirmation','lineup_confirmed') OR
    (lineup_generation_id IS NOT NULL AND lineup_generation_id=current_generation_id AND lineup_revision=generation_version)),
  CHECK((status='lineup_confirmed' AND confirmed_at IS NOT NULL AND confirmed_lineup_revision IS NOT NULL AND confirmed_lineup_revision=lineup_revision)
    OR (status<>'lineup_confirmed' AND confirmed_at IS NULL AND confirmed_lineup_revision IS NULL)),
  CHECK((status='lineup_generation_failed' AND lineup_error_code IS NOT NULL AND lineup_error_code IN (
    'LINEUP_PROVIDER_UNAVAILABLE','LINEUP_PROVIDER_CONFIGURATION','LINEUP_TIMEOUT','LINEUP_INVALID_STRUCTURE',
    'LINEUP_INVALID_MEMBERS','LINEUP_STORAGE_FAILED','LINEUP_INTERRUPTED')) OR
    (status<>'lineup_generation_failed' AND lineup_error_code IS NULL))
) STRICT;
INSERT INTO discussions_new (id,topic,expert_count,status,version,last_event_id,create_request_id,created_at,updated_at)
 SELECT id,topic,expert_count,status,version,last_event_id,create_request_id,created_at,updated_at FROM discussions;
DROP TABLE discussions;
ALTER TABLE discussions_new RENAME TO discussions;
CREATE TABLE lineup_members (
  member_id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL REFERENCES discussions(id),
  generation_id TEXT NOT NULL,
  generation_version INTEGER NOT NULL CHECK(generation_version > 0),
  role TEXT NOT NULL CHECK(role IN ('moderator','expert')),
  name TEXT NOT NULL CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 256),
  profession TEXT NOT NULL CHECK(length(CAST(profession AS BLOB)) BETWEEN 1 AND 320),
  title TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 320),
  stance TEXT NOT NULL CHECK(length(CAST(stance AS BLOB)) BETWEEN 1 AND 800),
  color TEXT NOT NULL CHECK(color IN ('#193455','#2157a5','#137568','#8b4c20','#734a9c','#9d3659','#496625','#345d78','#704d00')),
  display_order INTEGER NOT NULL CHECK(display_order BETWEEN 0 AND 8),
  name_key TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(discussion_id,display_order), UNIQUE(discussion_id,name_key),
  CHECK((role='moderator' AND display_order=0) OR (role='expert' AND display_order BETWEEN 1 AND 8)),
  FOREIGN KEY(discussion_id,generation_id,generation_version)
    REFERENCES discussions(id,lineup_generation_id,lineup_revision) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE UNIQUE INDEX one_lineup_moderator ON lineup_members(discussion_id) WHERE role='moderator';
`;
