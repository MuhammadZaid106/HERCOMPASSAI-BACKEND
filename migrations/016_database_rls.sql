-- Migration 016: Database Row-Level Security (Feature 15)
--
-- PURPOSE
-- -------
-- Adds Postgres RLS policies so that even if application code has a bug that
-- omits a WHERE clause, the database itself denies cross-user row access.
--
-- DESIGN
-- ------
-- Two roles are assumed:
--   hercompass_app    — runtime role used by Express / Sequelize (no superuser)
--   hercompass_migrations — privileged role that runs migrations; bypasses RLS
--
-- The app role connects via DATABASE_URL. Migrations run with BYPASSRLS or a
-- superuser role (see env.example and docs/handover/05_security.md).
--
-- STRATEGY
-- --------
-- - RLS is ENABLED on every member-owned table.
-- - A permissive SELECT/INSERT/UPDATE/DELETE policy allows access only when
--   `current_setting('app.current_user_id', true)` matches the row's user_id.
-- - Service-level reads (admin, partner digest) use the service role which
--   BYPASSRLS; they never go through these policies.
-- - The app sets `SET LOCAL app.current_user_id = '<uuid>'` at the start of
--   every authenticated transaction via the authMiddleware hook.
--
-- TABLES COVERED
-- --------------
-- Member-owned:   users (self), onboarding_profiles, personal_snapshots,
--                 symptom_entries, mood_entries, sleep_entries, energy_entries,
--                 lifestyle_entries, consents, goals, entitlement_usages,
--                 email_action_tokens, user_funnel_stamps, saved_content,
--                 snapshot_versions, ai_audit_logs, ai_feedbacks, ai_flags
-- Partner-scoped: partner_relationships (memberUserId), partner_consents,
--                 partner_permissions
-- Tracking:       analytics_events (userId nullable — allow NULL rows)
--
-- NOTE: Tables managed by a privileged background process (refresh_tokens,
-- password_reset_tokens, billing_events) keep application-level security;
-- RLS on them would break token rotation.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: enable RLS and create the standard user-scoped policy
-- ─────────────────────────────────────────────────────────────────────────────

-- users — member may only read/update their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
    USING (id::text = current_setting('app.current_user_id', true))
    WITH CHECK (id::text = current_setting('app.current_user_id', true));

-- onboarding_profiles
ALTER TABLE onboarding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onboarding_profiles_owner ON onboarding_profiles;
CREATE POLICY onboarding_profiles_owner ON onboarding_profiles
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- personal_snapshots
ALTER TABLE personal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_snapshots_owner ON personal_snapshots;
CREATE POLICY personal_snapshots_owner ON personal_snapshots
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- symptom_entries
ALTER TABLE symptom_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS symptom_entries_owner ON symptom_entries;
CREATE POLICY symptom_entries_owner ON symptom_entries
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- mood_entries
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mood_entries_owner ON mood_entries;
CREATE POLICY mood_entries_owner ON mood_entries
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- sleep_entries
ALTER TABLE sleep_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleep_entries_owner ON sleep_entries;
CREATE POLICY sleep_entries_owner ON sleep_entries
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- energy_entries
ALTER TABLE energy_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS energy_entries_owner ON energy_entries;
CREATE POLICY energy_entries_owner ON energy_entries
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- lifestyle_entries
ALTER TABLE lifestyle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifestyle_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lifestyle_entries_owner ON lifestyle_entries;
CREATE POLICY lifestyle_entries_owner ON lifestyle_entries
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- consents
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consents_owner ON consents;
CREATE POLICY consents_owner ON consents
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- goals
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goals_owner ON goals;
CREATE POLICY goals_owner ON goals
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- entitlement_usage
ALTER TABLE entitlement_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entitlement_usages_owner ON entitlement_usage;
CREATE POLICY entitlement_usages_owner ON entitlement_usage
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- email_action_tokens
ALTER TABLE email_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_action_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_action_tokens_owner ON email_action_tokens;
CREATE POLICY email_action_tokens_owner ON email_action_tokens
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- user_funnel_stamps
ALTER TABLE user_funnel_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_funnel_stamps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_funnel_stamps_owner ON user_funnel_stamps;
CREATE POLICY user_funnel_stamps_owner ON user_funnel_stamps
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- saved_content
ALTER TABLE saved_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_content FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_content_owner ON saved_content;
CREATE POLICY saved_content_owner ON saved_content
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- snapshot_versions
ALTER TABLE snapshot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS snapshot_versions_owner ON snapshot_versions;
CREATE POLICY snapshot_versions_owner ON snapshot_versions
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ai_audit_logs
ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_audit_logs_owner ON ai_audit_logs;
CREATE POLICY ai_audit_logs_owner ON ai_audit_logs
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ai_feedback
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_feedbacks_owner ON ai_feedback;
CREATE POLICY ai_feedbacks_owner ON ai_feedback
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ai_flags
ALTER TABLE ai_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_flags_owner ON ai_flags;
CREATE POLICY ai_flags_owner ON ai_flags
    USING (user_id::text = current_setting('app.current_user_id', true))
    WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

-- ─── Partner-scoped tables ────────────────────────────────────────────────────
-- partner_relationships — member owns their own relationships
ALTER TABLE partner_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_relationships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_relationships_member ON partner_relationships;
CREATE POLICY partner_relationships_member ON partner_relationships
    USING (
        member_user_id::text = current_setting('app.current_user_id', true)
        OR
        partner_user_id::text = current_setting('app.current_user_id', true)
    );

-- partner_consents — accessible by either side of the relationship
ALTER TABLE partner_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_consents_related ON partner_consents;
CREATE POLICY partner_consents_related ON partner_consents
    USING (
        relationship_id IN (
            SELECT id FROM partner_relationships
            WHERE member_user_id::text = current_setting('app.current_user_id', true)
               OR partner_user_id::text = current_setting('app.current_user_id', true)
        )
    );

-- partner_permissions
ALTER TABLE partner_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_permissions_related ON partner_permissions;
CREATE POLICY partner_permissions_related ON partner_permissions
    USING (
        relationship_id IN (
            SELECT id FROM partner_relationships
            WHERE member_user_id::text = current_setting('app.current_user_id', true)
               OR partner_user_id::text = current_setting('app.current_user_id', true)
        )
    );

-- ─── analytics_events — nullable userId ───────────────────────────────────────
-- Allow rows where user_id IS NULL (anonymous events) or matches the session.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_events_owner ON analytics_events;
CREATE POLICY analytics_events_owner ON analytics_events
    USING (
        user_id IS NULL
        OR user_id::text = current_setting('app.current_user_id', true)
    )
    WITH CHECK (
        user_id IS NULL
        OR user_id::text = current_setting('app.current_user_id', true)
    );

-- ─── Grant hercompass_app minimal rights ──────────────────────────────────────
-- Run these only when the role exists (CI may use a single superuser).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hercompass_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
            TO hercompass_app;
    END IF;
END
$$;
