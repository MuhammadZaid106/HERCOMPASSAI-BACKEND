-- Snapshot history, feedback, notification choices, explore progress, and support notes.
-- Additive and safe to run more than once.

CREATE TABLE IF NOT EXISTS snapshot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  dominant_focus_area VARCHAR(255),
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, version_number)
);

CREATE INDEX IF NOT EXISTS snapshot_versions_user_id_idx
  ON snapshot_versions (user_id, version_number DESC);

CREATE TABLE IF NOT EXISTS snapshot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_version_id UUID REFERENCES snapshot_versions(id) ON DELETE SET NULL,
  rating VARCHAR(32) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS snapshot_feedback_user_id_idx
  ON snapshot_feedback (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  snapshot BOOLEAN NOT NULL DEFAULT TRUE,
  tracking_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  recommendations BOOLEAN NOT NULL DEFAULT TRUE,
  partner BOOLEAN NOT NULL DEFAULT TRUE,
  plans BOOLEAN NOT NULL DEFAULT TRUE,
  account BOOLEAN NOT NULL DEFAULT TRUE,
  privacy_security BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS explore_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  saved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_requests_user_id_idx
  ON support_requests (user_id, created_at DESC);
