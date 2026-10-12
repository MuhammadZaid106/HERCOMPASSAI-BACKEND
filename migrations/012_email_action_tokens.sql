-- One-time email action tokens (signup verify now; email_change later).
-- Additive / IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS email_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  pending_email VARCHAR(255) NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_action_tokens_user_purpose_idx
  ON email_action_tokens (user_id, purpose);

CREATE INDEX IF NOT EXISTS email_action_tokens_expires_idx
  ON email_action_tokens (expires_at);
