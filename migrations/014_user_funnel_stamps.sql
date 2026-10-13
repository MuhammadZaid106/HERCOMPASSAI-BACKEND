-- Per-member first-write funnel timestamps for TTFV intervals.
-- account_created stays on users.created_at (not duplicated here).
-- assessment_completed is not distinct from onboarding_completed in this product.
-- Additive / IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS user_funnel_stamps (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  onboarding_started_at TIMESTAMPTZ NULL,
  onboarding_completed_at TIMESTAMPTZ NULL,
  snapshot_generated_at TIMESTAMPTZ NULL,
  snapshot_displayed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_funnel_stamps_onboarding_started_idx
  ON user_funnel_stamps (onboarding_started_at)
  WHERE onboarding_started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_funnel_stamps_snapshot_generated_idx
  ON user_funnel_stamps (snapshot_generated_at)
  WHERE snapshot_generated_at IS NOT NULL;
