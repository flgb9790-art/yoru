CREATE TABLE IF NOT EXISTS oauth_flows (
 state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
