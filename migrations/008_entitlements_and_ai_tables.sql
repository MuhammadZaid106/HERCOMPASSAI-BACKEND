-- 008_entitlements_and_ai_tables.sql
--
-- Two things:
--
-- 1. entitlement_usage — the meter that makes plan limits real. Until this
--    existed, `users.plan` was carried in the access token and read by the client
--    for labels, but nothing on the server ever consulted it, so "Free includes 5
--    AI insights" was marketing copy rather than a limit.
--
-- 2. DDL for ai_audit_logs, ai_feedback and ai_flags. These three models have
--    existed and been written to since the AI Gateway landed, but only ever via
--    `sequelize.sync()`, which is not a schema of record. That works on a dev
--    database and fails silently on a managed one where DDL privileges are
--    withheld.
--
-- Columns match the Sequelize definitions exactly so `sync({ alter: false })`
-- remains a no-op against a database built from these files.
--
-- Additive only: safe to run more than once. No data removed.

-- ─── Metered AI usage ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entitlement_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascades with the account, so a deleted member leaves no allowance behind and
  -- a new account with the same email starts from zero.
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- When this member's current window opened. Moved forward in place when the
  -- window lapses, so nobody is cut off because a calendar month turned over.
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ai_generations INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per member, not per member per window.
  --
  -- The keying matters for correctness, not tidiness. Keying on
  -- (user_id, window_started_at) meant the application computed the window as
  -- `now - 30 days` to the millisecond, so the key differed on every request:
  -- ON CONFLICT never matched, every call inserted a new row, and the
  -- count-then-increment around it could exceed the limit under concurrency.
  -- With one row per member, the increment and the window reset are a single
  -- locked statement guarded by `ai_generations < limit`.
  CONSTRAINT entitlement_usage_user_id_key UNIQUE (user_id),

  CONSTRAINT entitlement_usage_generations_non_negative CHECK (ai_generations >= 0)
);

-- Serve "how much have I used". The unique index above already covers
-- `user_id` lookups; this one is kept as the explicit access path for the
-- cleanup of lapsed windows.
CREATE INDEX IF NOT EXISTS entitlement_usage_user_idx
  ON entitlement_usage (user_id);

-- ─── AI Gateway provenance, feedback and review queue ─────────────────────────

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifies one generation. Carried by the response so the member's feedback
  -- and any later review resolve back to this exact event.
  request_id UUID NOT NULL,

  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  user_role VARCHAR(32) NOT NULL,
  feature VARCHAR(64) NOT NULL,
  provider VARCHAR(64),
  model VARCHAR(255),
  model_version VARCHAR(128),
  prompt_version VARCHAR(32) NOT NULL,
  prompt_checksum VARCHAR(64),
  evidence_version VARCHAR(32) NOT NULL,
  sci_version VARCHAR(32) NOT NULL,
  config_version VARCHAR(32) NOT NULL,

  result_status VARCHAR(24) NOT NULL
    CHECK (result_status IN ('approved', 'approved_with_repairs', 'fallback', 'blocked')),

  confidence VARCHAR(16),
  confidence_score FLOAT,
  safety_status VARCHAR(24) NOT NULL
    CHECK (safety_status IN ('pass', 'pass_with_warnings', 'blocked')),

  latency_ms INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,

  -- Provenance, not content. Raw prompts, raw completions and health data are
  -- deliberately absent: traceability without accumulating sensitive records.
  citation_ids JSONB,
  sci_finding_codes JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_audit_logs_request_id_key UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS ai_audit_logs_user_feature_idx
  ON ai_audit_logs (user_id, feature);
CREATE INDEX IF NOT EXISTS ai_audit_logs_created_at_idx
  ON ai_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS ai_audit_logs_result_created_idx
  ON ai_audit_logs (result_status, created_at);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- The generation this reacts to. Not a foreign key: a member may only ever
  -- submit feedback on their own events, and that is enforced in the controller
  -- by counting the audit row, so the constraint is application-level.
  request_id UUID NOT NULL,
  feature VARCHAR(64) NOT NULL,

  rating VARCHAR(24) NOT NULL
    CHECK (rating IN ('helpful', 'not_helpful', 'report_concern')),

  comment VARCHAR(1000),
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serves the reviewer queue: "unreviewed, and not merely a thumbs-up".
CREATE INDEX IF NOT EXISTS ai_feedback_reviewed_rating_idx
  ON ai_feedback (reviewed, rating);
CREATE INDEX IF NOT EXISTS ai_feedback_request_id_idx
  ON ai_feedback (request_id);

CREATE TABLE IF NOT EXISTS ai_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A flag points at exactly one AI event, and dies with it.
  request_id UUID NOT NULL
    REFERENCES ai_audit_logs (request_id) ON DELETE CASCADE,

  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  feature VARCHAR(64) NOT NULL,

  reason VARCHAR(32) NOT NULL
    CHECK (reason IN ('user_not_helpful', 'user_report_concern', 'sci_blocked', 'guardrail_blocked', 'manual')),

  severity VARCHAR(8) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high')),

  detail VARCHAR(1000),

  review_status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (review_status IN ('open', 'in_review', 'resolved', 'dismissed')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The review queue reads "open, worst first"; this serves that directly.
CREATE INDEX IF NOT EXISTS ai_flags_status_severity_idx
  ON ai_flags (review_status, severity);
CREATE INDEX IF NOT EXISTS ai_flags_request_id_idx
  ON ai_flags (request_id);
