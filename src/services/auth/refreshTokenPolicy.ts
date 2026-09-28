/**
 * Refresh token policy — pure functions, no database and no clock side effects.
 *
 * Separating the decision from the controller keeps the security rule
 * ("a rotated token that reappears means theft") unit-testable without a live
 * PostgreSQL instance.
 */

const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parses a jsonwebtoken-style duration ("15m", "7d", "1h30m", "900") to
 * milliseconds. A bare number is seconds, matching the JWT ecosystem.
 */
export function parseDurationMs(value: string): number {
  const compact = value.trim().replace(/\s+/g, "");

  if (/^\d+$/.test(compact)) {
    const seconds = Number(compact) * 1_000;
    if (seconds <= 0) throw new Error(`Invalid duration: "${value}"`);
    return seconds;
  }

  const pattern = /(\d+)(ms|s|m|h|d|w)/g;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(compact)) !== null) {
    total += Number(match[1]) * UNIT_MS[match[2]];
    consumed += match[0].length;
  }

  if (consumed === 0 || consumed !== compact.length || total <= 0) {
    throw new Error(`Invalid duration: "${value}"`);
  }

  return total;
}

export type RefreshAttemptVerdict =
  /** Token is live: issue a rotated pair. */
  | "valid"
  /** Rotated token replayed while still valid: theft, revoke the whole family. */
  | "reuse_detected"
  /** Revoked by logout: reject quietly, do not punish the live session. */
  | "revoked"
  | "expired"
  | "unknown";

export interface StoredRefreshToken {
  revoked: boolean;
  expiresAt: Date | string;
  familyId?: string | null;
  replacedByHash?: string | null;
}

/**
 * Classifies a presented refresh token.
 *
 * Expiry is checked *before* revocation on purpose. A leaked token that has
 * already expired cannot hurt anyone, and treating its replay as theft would
 * let an attacker who once held an old token log the victim out forever. Only a
 * replayed token that is still inside its validity window — and that was already
 * rotated — is treated as theft.
 */
export function classifyRefreshAttempt(
  stored: StoredRefreshToken | null | undefined,
  now: Date = new Date()
): RefreshAttemptVerdict {
  if (!stored) return "unknown";

  const expiresAt =
    stored.expiresAt instanceof Date ? stored.expiresAt : new Date(stored.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  if (stored.revoked) {
    const rotatedThenReplayed =
      Boolean(stored.replacedByHash) && Boolean(stored.familyId);
    return rotatedThenReplayed ? "reuse_detected" : "revoked";
  }

  return "valid";
}
