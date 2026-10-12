-- Product analytics event stream (member funnel + checkout).
-- Additive / IF NOT EXISTS — safe to re-run.

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(64) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON analytics_events (created_at DESC);
