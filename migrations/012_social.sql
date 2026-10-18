ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS root_id TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS comments_thread ON comments(anime_id,root_id,created_at);
CREATE TABLE IF NOT EXISTS comment_votes (
 comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 value INTEGER NOT NULL CHECK(value IN(-1,1)), PRIMARY KEY(comment_id,user_id)
);
CREATE TABLE IF NOT EXISTS direct_messages (
 id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '', anime_id TEXT REFERENCES anime(id) ON DELETE SET NULL,
 anime_title TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
 CHECK(sender_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_recipient ON direct_messages(recipient_id,created_at);
CREATE INDEX IF NOT EXISTS messages_sender ON direct_messages(sender_id,created_at);
CREATE TABLE IF NOT EXISTS social_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('message','reply')), entity_id TEXT NOT NULL UNIQUE,
 anime_id TEXT REFERENCES anime(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS social_notifications_user ON social_notifications(user_id,created_at);
CREATE TABLE IF NOT EXISTS deleted_anime (
 id TEXT PRIMARY KEY, shikimori_id INTEGER UNIQUE, snapshot JSONB NOT NULL,
 deleted_by TEXT, reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS anime_import_locks (shikimori_id INTEGER PRIMARY KEY);
