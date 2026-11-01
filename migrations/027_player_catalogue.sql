-- Membership comes from complete source catalogues, never from missing lazy-cache rows.
CREATE TABLE IF NOT EXISTS player_catalogue (
 provider TEXT NOT NULL,
 shikimori_id INTEGER NOT NULL,
 PRIMARY KEY(provider,shikimori_id)
);
CREATE INDEX IF NOT EXISTS player_catalogue_shikimori ON player_catalogue(shikimori_id);
CREATE TABLE IF NOT EXISTS player_catalogue_staging (
 provider TEXT NOT NULL,
 shikimori_id INTEGER NOT NULL,
 PRIMARY KEY(provider,shikimori_id)
);
CREATE TABLE IF NOT EXISTS player_catalogue_state (
 provider TEXT PRIMARY KEY,
 checked_at TIMESTAMPTZ,
 staging_cycle TIMESTAMPTZ,
 staged_page INTEGER NOT NULL DEFAULT 0
);
INSERT INTO player_catalogue_state(provider) VALUES('kodik'),('aniliberty') ON CONFLICT(provider) DO NOTHING;
-- Bootstrap a full cycle. Once published, ordinary restarts leave schedules alone.
UPDATE kodik_geo_state SET next_run=NOW(),lease_until='1970-01-01'
 WHERE id=1 AND NOT EXISTS(SELECT 1 FROM player_catalogue_state WHERE provider='kodik' AND checked_at IS NOT NULL);
UPDATE aniliberty_catalog_state SET page=1,cycle_started_at=NOW(),next_run=NOW(),lease_until='1970-01-01'
 WHERE id=1 AND NOT EXISTS(SELECT 1 FROM player_catalogue_state WHERE provider='aniliberty' AND checked_at IS NOT NULL);
