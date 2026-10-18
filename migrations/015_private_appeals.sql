CREATE TABLE IF NOT EXISTS private_appeals (
 id TEXT PRIMARY KEY,
 category TEXT NOT NULL CHECK(category IN ('rights','privacy','support')),
 sender_name TEXT NOT NULL, email TEXT NOT NULL, organization TEXT NOT NULL DEFAULT '',
 subject TEXT NOT NULL, body TEXT NOT NULL, links TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','review','closed')),
 policy_version TEXT NOT NULL, rights_attested BOOLEAN NOT NULL DEFAULT FALSE,
 acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS private_appeals_created ON private_appeals(created_at);
