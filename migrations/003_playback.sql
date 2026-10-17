CREATE TABLE IF NOT EXISTS player_sources (
 anime_id TEXT PRIMARY KEY REFERENCES anime(id) ON DELETE CASCADE,
 available BOOLEAN NOT NULL DEFAULT FALSE,
 link TEXT NOT NULL DEFAULT '', quality TEXT NOT NULL DEFAULT '',
 translation TEXT NOT NULL DEFAULT '', checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE player_sources ADD COLUMN IF NOT EXISTS page_origin TEXT NOT NULL DEFAULT '';
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS season INTEGER NOT NULL DEFAULT 1;
ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS translation_id INTEGER;
ALTER TABLE watch_history DROP CONSTRAINT IF EXISTS watch_history_user_id_anime_id_episode_key;
CREATE UNIQUE INDEX IF NOT EXISTS watch_history_episode_unique ON watch_history(user_id,anime_id,season,episode);
