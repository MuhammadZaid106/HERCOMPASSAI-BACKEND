-- 009_snapshot_version_narrative.sql
--
-- Two related gaps in Snapshot history.
--
-- 1. snapshot_versions.payload. A version row used to hold four scores and a
--    focus area, so the history timeline could show a member their past state
--    without the narrative that explained it. The narrative lived only in
--    `personal_snapshots`, which is UNIQUE on user_id and therefore holds exactly
--    one current row — reading an old version would have shown the *current*
--    Snapshot's wording under an old date. Now each version keeps the payload as
--    it was presented at the time.
--
--    Nullable and not backfilled on purpose: the text a member read months ago was
--    never stored, so there is nothing truthful to reconstruct. Existing rows read
--    as "no narrative recorded for this version" rather than being filled with
--    today's Snapshot.
--
-- 2. snapshot_feedback.rating gains a CHECK constraint. The column was created as
--    bare VARCHAR(32) by `sync()`, which accepted any string, so a typo or a
--    client-side rating that no longer exists would have been stored as if it were
--    real feedback. `report_concern` is included for the Snapshot page's
--    "Report a concern" path.
--
-- Additive only: safe to run more than once. No rows removed or rewritten.

ALTER TABLE snapshot_versions
  ADD COLUMN IF NOT EXISTS payload JSONB;

COMMENT ON COLUMN snapshot_versions.payload IS
  'Presented Snapshot narrative as shown at this version. NULL for versions '
  'recorded before the column existed; not backfilled because the historical '
  'text was never stored.';

-- The pre-existing `helpful` / `not_helpful` rows stay valid. The constraint is
-- dropped first only so this is re-runnable against a database where a previous
-- run of this file already added it.
ALTER TABLE snapshot_feedback
  DROP CONSTRAINT IF EXISTS snapshot_feedback_rating_check;

ALTER TABLE snapshot_feedback
  ADD CONSTRAINT snapshot_feedback_rating_check
  CHECK (rating IN ('helpful', 'not_helpful', 'report_concern'));

-- Serves "which versions still have no narrative", which is the backfill backlog
-- and the thing to check after a deploy.
CREATE INDEX IF NOT EXISTS snapshot_versions_missing_payload_idx
  ON snapshot_versions (user_id)
  WHERE payload IS NULL;