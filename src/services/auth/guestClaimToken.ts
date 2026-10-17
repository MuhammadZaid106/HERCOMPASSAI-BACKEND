import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

/**
 * The handoff token for the no-signup Snapshot.
 *
 * After a guest receives their free Snapshot, the browser holds this token. If
 * they then sign up, `register` presents it to prove which guest account is
 * theirs, and that account is upgraded in place so their answers and Snapshot
 * carry over instead of being abandoned.
 *
 * It is signed with the same secret as access tokens but carries a distinct
 * `typ` claim, so a guest token can never be mistaken for a session token (and
 * vice versa) even though both are JWTs from the same key.
 */
export interface GuestClaimPayload {
  typ: "guest_claim";
  guestUserId: string;
  subjectHash: string;
}

export function signGuestClaimToken(input: {
  guestUserId: string;
  subjectHash: string;
}): string {
  const payload: GuestClaimPayload = {
    typ: "guest_claim",
    guestUserId: input.guestUserId,
    subjectHash: input.subjectHash,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.GUEST_CLAIM_TOKEN_TTL_HOURS}h`,
  });
}

/**
 * Returns the payload, or null for any token that is missing, expired, forged or
 * of the wrong type. Callers treat null as "no claim" and fall back to a normal
 * signup rather than failing the request: a stale handoff token must never block
 * someone from creating an account.
 */
export function verifyGuestClaimToken(token: string): GuestClaimPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Partial<GuestClaimPayload>;
    if (
      decoded?.typ !== "guest_claim" ||
      typeof decoded.guestUserId !== "string" ||
      typeof decoded.subjectHash !== "string"
    ) {
      return null;
    }
    return {
      typ: "guest_claim",
      guestUserId: decoded.guestUserId,
      subjectHash: decoded.subjectHash,
    };
  } catch {
    return null;
  }
}
