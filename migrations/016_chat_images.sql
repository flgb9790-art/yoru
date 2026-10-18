ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS image_expires_at TIMESTAMPTZ;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS image_hash TEXT;
CREATE TABLE IF NOT EXISTS message_images (
 message_id TEXT PRIMARY KEY REFERENCES direct_messages(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 mime TEXT NOT NULL, bytes BYTEA NOT NULL, size INTEGER NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS message_images_expiry ON message_images(expires_at);
CREATE TABLE IF NOT EXISTS message_image_lock(id INTEGER PRIMARY KEY);
INSERT INTO message_image_lock(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS direct_messages_live_seq;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS live_seq BIGINT DEFAULT nextval('direct_messages_live_seq');
CREATE SEQUENCE IF NOT EXISTS notifications_live_seq;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS live_seq BIGINT DEFAULT nextval('notifications_live_seq');
CREATE SEQUENCE IF NOT EXISTS social_notifications_live_seq;
ALTER TABLE social_notifications ADD COLUMN IF NOT EXISTS live_seq BIGINT DEFAULT nextval('social_notifications_live_seq');

CREATE INDEX IF NOT EXISTS messages_recipient_live ON direct_messages(recipient_id,live_seq);
CREATE INDEX IF NOT EXISTS notifications_user_live ON notifications(user_id,live_seq);
CREATE INDEX IF NOT EXISTS social_notifications_user_live ON social_notifications(user_id,live_seq);
