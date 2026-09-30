-- Notification read state, importance, deep links, and the indexes the member
-- notification list needs.
--
-- The `notifications` table was originally created by `sequelize.sync({alter:true})`
-- rather than a migration, so the CREATE is repeated here to keep this file safe
-- to run against a database that has not synced yet. Everything is IF NOT EXISTS,
-- so running it repeatedly never duplicates columns or indexes.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  important BOOLEAN NOT NULL DEFAULT FALSE,
  target_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marks a notice as a privacy or security event. These are governed by the
-- dedicated `privacySecurity` preference rather than the per-category toggle, so
-- turning off "Account notices" cannot hide a password change.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT FALSE;

-- Where the notice points. Null for notices with no destination.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_url VARCHAR(255);

-- Serves the member list, which is always ordered newest first.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

-- Serves the unread badge, which counts by user on every account load.
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id)
  WHERE read_at IS NULL;
