CREATE TABLE IF NOT EXISTS registration_invites (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES users(id),
 note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 revoked_at TIMESTAMPTZ
);
ALTER TABLE oauth_flows ADD COLUMN IF NOT EXISTS invite_id TEXT REFERENCES registration_invites(id);
CREATE INDEX IF NOT EXISTS registration_invites_created ON registration_invites(created_at DESC);
