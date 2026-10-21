CREATE TABLE IF NOT EXISTS profile_showcase(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,anime_id)
);
CREATE INDEX IF NOT EXISTS profile_showcase_order ON profile_showcase(user_id,added_at,anime_id);
