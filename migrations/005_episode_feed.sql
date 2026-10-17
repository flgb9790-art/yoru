CREATE TABLE IF NOT EXISTS episode_releases (
 id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 provider TEXT NOT NULL DEFAULT 'aniliberty', release_id INTEGER NOT NULL,
 source_episode_id TEXT NOT NULL, season INTEGER NOT NULL DEFAULT 1, episode INTEGER NOT NULL,
 name TEXT NOT NULL DEFAULT '', source_updated_at TIMESTAMPTZ,
 listed_at TIMESTAMPTZ NOT NULL, date_kind TEXT NOT NULL,
 available BOOLEAN NOT NULL DEFAULT TRUE,
 first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(anime_id,provider,release_id,season,episode), UNIQUE(provider,source_episode_id)
);
CREATE INDEX IF NOT EXISTS episodes_feed_order ON episode_releases(listed_at);
CREATE TABLE IF NOT EXISTS episode_feed_titles (
 anime_id TEXT PRIMARY KEY REFERENCES anime(id) ON DELETE CASCADE,
 release_id INTEGER NOT NULL, source_fresh_at TIMESTAMPTZ, checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}';
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS source_release_id INTEGER;
