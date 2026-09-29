-- 003_personal_snapshots.sql
--
-- Storage for the Personal Menopause Snapshot™ (spec: "Snapshot storage and
-- versioning").
--
-- The Snapshot is an AI artifact, not a projection: it was produced once by the
-- Gateway from a specific consent record and a specific set of deterministic
-- baseline + Trend Engine values, and it has to remain reproducible afterwards.
-- Storing it means opening the page does not spend a model call and cannot
-- change what the member already read, and `context_fingerprint` means a
-- re-submitted assessment invalidates the stored copy instead of silently
-- serving a stale one.
--
-- Additive only: safe to run more than once (IF NOT EXISTS). No data removed.

CREATE TABLE IF NOT EXISTS personal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascades with the account so member deletion stays complete. The unique
  -- constraint is what makes "one current Snapshot per member" a database
  -- guarantee rather than a convention the service has to remember.
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Onboarding profile version this Snapshot was generated from.
  version VARCHAR(20) NOT NULL DEFAULT '1.0',

  -- Gateway request id. ai_audit_logs.request_id is the other end of this
  -- reference, so a member support report resolves to the exact AI event.
  request_id UUID NOT NULL,

  result_status VARCHAR(24) NOT NULL,
  confidence VARCHAR(16),
  confidence_score INTEGER,
  safety_status VARCHAR(24) NOT NULL DEFAULT 'approved',

  prompt_version VARCHAR(20) NOT NULL DEFAULT 'unset',
  evidence_version VARCHAR(40) NOT NULL DEFAULT 'unset',
  sci_version VARCHAR(40) NOT NULL DEFAULT 'unset',
  model_version VARCHAR(120),

  -- The consent that authorised this generation. Kept so a withdrawn consent
  -- can be reconciled against every artifact it produced.
  consent_version VARCHAR(20) NOT NULL,
  consent_type VARCHAR(64) NOT NULL,

  -- SHA-256 over the deterministic baseline, consent and Trend Engine values the
  -- Snapshot was generated from. This is the cache key and the invalidation key.
  context_fingerprint VARCHAR(64) NOT NULL,

  -- The presented payload exactly as the member was shown it, so what is stored
  -- and what was displayed can never drift apart.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT personal_snapshots_user_id_key UNIQUE (user_id)
);

-- Snapshot lookup on page load is by user, and the unique constraint above
-- already provides that index. This one serves support and audit queries that
-- resolve a Snapshot from a Gateway request id.
CREATE INDEX IF NOT EXISTS personal_snapshots_request_id_idx
  ON personal_snapshots (request_id);
