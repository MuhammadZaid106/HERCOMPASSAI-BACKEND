-- 008_snapshot_confidence_score.sql
--
-- confidence_score is a 0–1 decimal from the confidence service (for example
-- 0.52 or 0.8736). The original column was INTEGER, so Postgres rejected the
-- insert and the Snapshot was shown but not stored.
--
-- Safe to run more than once. Skips the change when the column is already
-- a floating-point type.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'personal_snapshots'
      AND column_name = 'confidence_score'
      AND data_type IN ('smallint', 'integer', 'bigint')
  ) THEN
    ALTER TABLE personal_snapshots
      ALTER COLUMN confidence_score TYPE DOUBLE PRECISION
      USING confidence_score::double precision;
  END IF;
END $$;
