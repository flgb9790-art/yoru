CREATE TABLE IF NOT EXISTS aniliberty_availability (
 anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 release_id INTEGER NOT NULL,
 available BOOLEAN NOT NULL DEFAULT FALSE,
 checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(anime_id,release_id)
);
CREATE INDEX IF NOT EXISTS aniliberty_availability_checked ON aniliberty_availability(checked_at);
CREATE TABLE IF NOT EXISTS aniliberty_catalog_state (
 id INTEGER PRIMARY KEY,
 page INTEGER NOT NULL DEFAULT 1,
 cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 next_run TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 lease_until TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
 last_error TEXT NOT NULL DEFAULT ''
);
INSERT INTO aniliberty_catalog_state(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
