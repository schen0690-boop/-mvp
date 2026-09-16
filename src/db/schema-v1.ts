// Frozen stage-2 final DDL: migration 001 must remain immutable.
export const schemaV1 = `CREATE TABLE IF NOT EXISTS discussions (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL CHECK(length(CAST(topic AS BLOB)) BETWEEN 1 AND 2000),
      expert_count INTEGER NOT NULL CHECK(expert_count BETWEEN 1 AND 8),
      status TEXT NOT NULL CHECK(status = 'created'),
      version INTEGER NOT NULL CHECK(version = 1),
      last_event_id INTEGER NOT NULL CHECK(last_event_id = 1),
      create_request_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS public_events (
      discussion_id TEXT NOT NULL REFERENCES discussions(id),
      event_id INTEGER NOT NULL CHECK(event_id > 0),
      data_version INTEGER NOT NULL CHECK(data_version > 0),
      type TEXT NOT NULL CHECK(type = 'discussion.status_changed'),
      occurred_at TEXT NOT NULL,
      payload TEXT NOT NULL CHECK(json_valid(payload)),
      PRIMARY KEY(discussion_id, event_id)
    ) STRICT;
`;
