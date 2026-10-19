CREATE TABLE IF NOT EXISTS parser_genres (
 id INTEGER PRIMARY KEY, genres JSONB NOT NULL DEFAULT '[]', fetched_at TIMESTAMPTZ
);
INSERT INTO parser_genres(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS manual_parse_runs (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, config JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', page INTEGER NOT NULL DEFAULT 1,
 exhausted BOOLEAN NOT NULL DEFAULT FALSE, stage TEXT NOT NULL DEFAULT 'Ожидает запуска',
 current_title TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', failures INTEGER NOT NULL DEFAULT 0,
 available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_token TEXT, lease_until TIMESTAMPTZ,
 heartbeat_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS manual_parse_items (
 run_id TEXT NOT NULL REFERENCES manual_parse_runs(id) ON DELETE CASCADE,
 shikimori_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
 reason TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(run_id,shikimori_id)
);
CREATE INDEX IF NOT EXISTS manual_parse_active ON manual_parse_runs(status,created_at);
