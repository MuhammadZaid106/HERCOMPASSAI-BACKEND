-- 002_onboarding_profile_consent_and_additions.sql
--
-- Adds to onboarding_profiles the columns the model defines but that are
-- missing from an existing table. `sequelize.sync({ alter: false })` never adds
-- columns to an existing table, so without this migration any read of these
-- fields fails with "column does not exist" (e.g. GET /api/onboarding/me).
--
-- Additive only: safe to run more than once (IF NOT EXISTS). No data removed.

-- Consent tracking read by the AI gateway before generating (a member whose
-- consent_type is anything other than wellness_personalization is treated as
-- not having given explicit consent and the gateway refuses to run).
ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS consent_type VARCHAR(64) NOT NULL DEFAULT 'legacy_assessment';

-- Mood & emotional baseline additions.
ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS mood_patterns JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Couple & Partner Support (CPS) additions.
ALTER TABLE onboarding_profiles
  ADD COLUMN IF NOT EXISTS partner_support_needs JSONB NOT NULL DEFAULT '[]'::jsonb;