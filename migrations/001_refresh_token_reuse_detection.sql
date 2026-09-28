-- 001_refresh_token_reuse_detection.sql
--
-- Adds refresh-token family tracking so that replaying an already-rotated token
-- can revoke the whole session lineage (refresh token reuse detection).
--
-- REQUIRED: the app boots with `sequelize.sync({ alter: false })`, which never
-- adds columns to an existing table. Run this once against the same database as
-- DATABASE_URL, or the controller will fail on the missing columns.
--
-- Safe to run more than once (IF NOT EXISTS).

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id UUID NULL;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS replaced_by_hash VARCHAR(64) NULL;

-- Reuse lookups scan by user + family.
CREATE INDEX IF NOT EXISTS refresh_tokens_user_family_idx
  ON refresh_tokens (user_id, family_id);

-- Supports the periodic purge of dead rows.
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx
  ON refresh_tokens (expires_at);

-- Backfill: every pre-existing token becomes the root of its own family, so
-- historical rows get reuse protection without being grouped together.
UPDATE refresh_tokens
   SET family_id = id
 WHERE family_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: purge dead rows. Run periodically (pg_cron, a nightly job, etc.).
-- Rows are only removable once they are expired AND revoked, so a live session
-- can never be deleted out from under itself.
--
--   DELETE FROM refresh_tokens
--    WHERE revoked = true
--      AND expires_at < NOW() - INTERVAL '30 days';
-- ─────────────────────────────────────────────────────────────────────────────
