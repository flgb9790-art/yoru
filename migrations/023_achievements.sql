CREATE TABLE IF NOT EXISTS user_achievements (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 achievement_id TEXT NOT NULL, unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 displayed BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS reward_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 href TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'spark',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
 shown_at TIMESTAMPTZ, cleared_at TIMESTAMPTZ, UNIQUE(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS reward_notifications_inbox ON reward_notifications(user_id,created_at);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE social_notifications ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS comments_achievement_progress ON comments(user_id);
