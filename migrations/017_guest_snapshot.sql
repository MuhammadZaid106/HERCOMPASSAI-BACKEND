-- 017_guest_snapshot.sql
--
-- One free, no-signup Personal Menopause Snapshot.
--
-- The product promise is "try the Snapshot once without an account, then create
-- an account to keep going". That promise has two hard requirements the client
-- cannot be trusted to enforce:
--
--   1. Every AI interaction must be auditable. ai_audit_logs.user_id is a
--      foreign key to users, so a guest cannot be a throwaway string — the guest
--      needs a real, lightweight account row.
--   2. "One free" must be server-side. A localStorage flag is reset by opening a
--      private window, so the allowance is keyed on a hashed subject
--      (ip + device fingerprint) in guest_snapshot_claims with a unique
--      constraint doing the enforcement.
--
-- The guest account is claimable: when the visitor signs up, register upgrades
-- this same row instead of creating a new one, so their Snapshot and answers
-- carry over. Abandoned guest accounts are purged after `expires_at`.
--
-- Additive only: safe to run more than once (IF NOT EXISTS). No data removed.

-- ─── Guest identity on the users table ────────────────────────────────────────
-- is_guest marks a row created by the guest flow. guest_subject_hash is the
-- hashed subject that created it; it is cleared when the account is claimed so a
-- real account never looks like a guest. The unique index lets a repeat request
-- from the same subject reuse the same guest row instead of creating duplicates.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_subject_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS users_guest_subject_hash_unique
  ON users (guest_subject_hash)
  WHERE guest_subject_hash IS NOT NULL;

-- ─── One-free enforcement ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guest_snapshot_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- sha256(ip | fingerprint | server secret). The unique constraint is the
  -- single source of truth for "this device already used its free Snapshot".
  subject_hash VARCHAR(64) NOT NULL UNIQUE,

  -- The lightweight guest account the free Snapshot was generated for. Cascades
  -- so purging or deleting the guest account removes the claim with it.
  guest_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Retained separately from the combined subject_hash for abuse analysis.
  ip_hash VARCHAR(64) NOT NULL,
  fingerprint_hash VARCHAR(64) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Time the abandoned-guest purge treats as the end of life for this claim.
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set when the visitor signs up and the guest account is claimed.
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS guest_snapshot_claims_expires_at_idx
  ON guest_snapshot_claims (expires_at);
