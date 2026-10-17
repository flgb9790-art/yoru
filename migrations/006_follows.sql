CREATE TABLE IF NOT EXISTS anime_follows (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 last_episode INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,anime_id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 season INTEGER NOT NULL DEFAULT 1, episode INTEGER NOT NULL, release_id INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
 UNIQUE(user_id,anime_id,season,episode)
);
CREATE INDEX IF NOT EXISTS notifications_user_date ON notifications(user_id,created_at);
