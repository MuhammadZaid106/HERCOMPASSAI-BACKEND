-- Admin six-slice tables and user.trial_ends_at.
-- Additive / IF NOT EXISTS — safe to re-run. Match Sequelize underscored models.

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY,
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  stripe_event_id VARCHAR(128) NOT NULL UNIQUE,
  type VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  plan VARCHAR(16) NULL,
  amount_cents INTEGER NULL,
  currency VARCHAR(8) NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  summary VARCHAR(280) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_events_user_id ON billing_events (user_id);
CREATE INDEX IF NOT EXISTS billing_events_status ON billing_events (status);
CREATE INDEX IF NOT EXISTS billing_events_occurred_at ON billing_events (occurred_at);

CREATE TABLE IF NOT EXISTS billing_grandfathered (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  note VARCHAR(280) NOT NULL DEFAULT '',
  staff_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_request_excerpts (
  request_id UUID PRIMARY KEY,
  input_excerpt TEXT NOT NULL DEFAULT '',
  output_excerpt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_flag_cases (
  flag_id UUID PRIMARY KEY REFERENCES ai_flags(id) ON DELETE CASCADE,
  input_excerpt TEXT NOT NULL DEFAULT '',
  output_excerpt TEXT NOT NULL DEFAULT '',
  citation_ids JSONB NULL,
  sci_finding_codes JSONB NULL,
  result_status VARCHAR(32) NULL,
  safety_status VARCHAR(32) NULL,
  retained_until TIMESTAMPTZ NOT NULL,
  last_retest_at TIMESTAMPTZ NULL,
  last_retest_passed BOOLEAN NULL,
  last_retest_notes VARCHAR(280) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id UUID PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  priority VARCHAR(8) NOT NULL,
  feature VARCHAR(64) NOT NULL,
  fixture_output TEXT NOT NULL,
  must_be_non_diagnostic BOOLEAN NOT NULL DEFAULT TRUE,
  must_include_citation_hint BOOLEAN NOT NULL DEFAULT FALSE,
  expect_pass BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY,
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  triggered_by UUID NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  notes VARCHAR(280) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  failure_codes JSONB NOT NULL DEFAULT '[]',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  notes VARCHAR(280) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS evaluation_results_run_id ON evaluation_results (run_id);

CREATE TABLE IF NOT EXISTS evidence_submissions (
  id UUID PRIMARY KEY,
  evidence_id VARCHAR(64) NOT NULL UNIQUE,
  source_name VARCHAR(160) NOT NULL,
  organization VARCHAR(160) NOT NULL,
  topic VARCHAR(160) NOT NULL,
  publication_date VARCHAR(32) NOT NULL DEFAULT '',
  url_or_identifier VARCHAR(280) NOT NULL DEFAULT '',
  evidence_category VARCHAR(64) NOT NULL DEFAULT 'medical',
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  version VARCHAR(16) NOT NULL DEFAULT '1.0',
  review_notes VARCHAR(280) NOT NULL DEFAULT '',
  reviewed_by VARCHAR(120) NULL,
  reviewed_at TIMESTAMPTZ NULL,
  clinician_reviewer_name VARCHAR(120) NOT NULL DEFAULT '',
  next_review_at TIMESTAMPTZ NULL,
  staff_user_id UUID NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE evidence_status ADD COLUMN IF NOT EXISTS clinician_reviewer_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE evidence_status ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120) NULL;
ALTER TABLE evidence_status ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL;
ALTER TABLE evidence_status ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ NULL;
ALTER TABLE evidence_status ADD COLUMN IF NOT EXISTS version VARCHAR(16) NOT NULL DEFAULT '1.0';

ALTER TABLE content_pieces ALTER COLUMN kind TYPE VARCHAR(32);
