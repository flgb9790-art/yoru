CREATE TABLE IF NOT EXISTS push_devices (
 id TEXT PRIMARY KEY,
 secret_hash TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 message_seq BIGINT NOT NULL DEFAULT 0,
 episode_seq BIGINT NOT NULL DEFAULT 0,
 lease_until TIMESTAMPTZ,
 next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 failures INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_devices_schedule ON push_devices(next_attempt);
