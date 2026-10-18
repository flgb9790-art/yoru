CREATE TABLE IF NOT EXISTS user_contacts (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,contact_id), CHECK(user_id<>contact_id)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_active_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS chat_typing (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 peer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,peer_id), CHECK(user_id<>peer_id)
);
CREATE INDEX IF NOT EXISTS messages_pair_history ON direct_messages(sender_id,recipient_id,created_at,id);
CREATE INDEX IF NOT EXISTS messages_unread ON direct_messages(recipient_id,sender_id) WHERE read_at IS NULL;
