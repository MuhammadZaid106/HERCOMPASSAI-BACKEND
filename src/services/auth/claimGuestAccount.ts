import { GuestSnapshotClaim, User } from "../../models/index.js";
import { verifyGuestClaimToken } from "./guestClaimToken.js";

/**
 * Upgrades a no-signup guest account into a real one at signup.
 *
 * When a visitor takes the free Snapshot and then registers, the browser
 * presents the handoff token. Claiming the existing row — rather than creating a
 * new account — is what makes their answers and Snapshot survive the signup
 * instead of being orphaned.
 *
 * Every outcome other than `claimed` is a normal signup: the caller falls
 * through and creates a fresh account. That is deliberate — a bad handoff token
 * must never stop someone creating an account.
 */
export type ClaimGuestResult =
  | { status: "claimed"; user: User }
  | { status: "email_taken" }
  | { status: "not_claimable" };

export interface ClaimGuestParams {
  claimToken: string;
  name: string;
  email: string;
  passwordHash: string;
}

export async function claimGuestAccount(
  params: ClaimGuestParams,
): Promise<ClaimGuestResult> {
  const payload = verifyGuestClaimToken(params.claimToken);
  if (!payload) return { status: "not_claimable" };

  const guest = await User.findByPk(payload.guestUserId);
  if (!guest || !guest.isGuest || guest.guestSubjectHash !== payload.subjectHash) {
    return { status: "not_claimable" };
  }

  // The target email may already belong to someone else. Compare against the
  // guest row itself so a resubmitted claim is not mistaken for a conflict.
  const owner = await User.findOne({ where: { email: params.email } });
  if (owner && owner.id !== guest.id) {
    return { status: "email_taken" };
  }

  // Guarded update: only a row still marked as a guest can be claimed, so two
  // concurrent signups cannot both upgrade the same account. Zero affected rows
  // means another request already claimed it.
  const [affected] = await User.update(
    {
      name: params.name,
      email: params.email,
      passwordHash: params.passwordHash,
      isGuest: false,
      guestSubjectHash: null,
      emailVerified: false,
    },
    { where: { id: guest.id, isGuest: true } },
  );

  if (affected === 0) return { status: "not_claimable" };

  // Mark the allowance as claimed so the abandoned-guest purge leaves this
  // account alone and the one-free audit trail is complete.
  await GuestSnapshotClaim.update(
    { claimedAt: new Date() },
    { where: { guestUserId: guest.id, claimedAt: null } },
  );

  await guest.reload();
  return { status: "claimed", user: guest };
}
