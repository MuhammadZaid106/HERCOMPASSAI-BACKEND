import { createHash } from "node:crypto";
import { Op } from "sequelize";
import { sequelize } from "../../config/db.js";
import { env } from "../../config/env.js";
import { GuestSnapshotClaim, OnboardingProfile, User } from "../../models/index.js";
import { calculateDeterministicScores } from "./calculateScores.js";
import { generatePersonalSnapshot } from "./personalSnapshotService.js";
import { signGuestClaimToken } from "../auth/guestClaimToken.js";
import type { OnboardingPayload } from "../../controllers/onboarding/onboardingSchemas.js";
import { logger } from "../../utils/logger.js";

const guestLog = logger.module("GUEST-SNAPSHOT");

/**
 * One free, no-signup Personal Menopause Snapshot.
 *
 * This is the seam that turns the marketing promise into a real, server-enforced
 * allowance. The previous version built a hardcoded Snapshot in the browser and
 * set a localStorage flag, so the "one free" rule was really "one per browser
 * profile": clearing storage, opening a private window, or editing the JSON all
 * reset it, and the Snapshot was never produced by the Gateway at all.
 *
 * Here the guest gets a real, lightweight account:
 *   - the AI pipeline can audit the interaction (ai_audit_logs.user_id is a
 *     foreign key, so a throwaway string would fail the write), and
 *   - the same account is claimable at signup, so the visitor's answers and
 *     Snapshot are not thrown away.
 *
 * "One free" is enforced by a unique subject hash in guest_snapshot_claims, not
 * by anything the client can rewrite.
 */

export interface GuestSnapshotRequest {
  payload: OnboardingPayload;
  /** Opaque device fingerprint supplied by the browser. Never trusted alone. */
  fingerprint: string;
  ip: string | null;
  userAgent: string | null;
}

export type GuestSnapshotOutcome =
  | {
      ok: true;
      snapshot: Record<string, unknown>;
      generated: boolean;
      requestId: string;
      /** Proves ownership of the guest account so signup can claim it. */
      claimToken: string;
      /** When the unclaimed guest account will be purged. */
      expiresAt: string;
    }
  | {
      ok: false;
      statusCode: number;
      reason: "guest_limit_reached" | "ai_unavailable";
      message: string;
    };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The subject the allowance is keyed on.
 *
 * ip and fingerprint are hashed separately for abuse analysis, then combined
 * with a server secret and hashed again so the stored value is a stable,
 * non-reversible subject rather than any raw identifier.
 */
function subjectFor(ip: string | null, fingerprint: string): {
  subjectHash: string;
  ipHash: string;
  fingerprintHash: string;
} {
  const ipHash = sha256(ip && ip.trim() !== "" ? ip : "unknown-ip");
  const fingerprintHash = sha256(fingerprint);
  const subjectHash = sha256(`${ipHash}|${fingerprintHash}|${env.JWT_SECRET}`);
  return { subjectHash, ipHash, fingerprintHash };
}

function buildProfileFields(userId: string, payload: OnboardingPayload) {
  const deterministicScores = calculateDeterministicScores({
    primaryHealthConcerns: payload.primaryHealthConcerns,
    symptomImpact: payload.symptomImpact,
    sleepQuality: payload.sleepQuality,
    sleepChallenges: payload.sleepChallenges,
    energyLevel: payload.energyLevel,
    activityLevel: payload.activityLevel,
    weeklyExerciseMinutes: payload.weeklyExerciseMinutes,
    energyAfterMealRating: payload.energyAfterMealRating,
    moodBaseline: payload.moodBaseline,
    moodOverall: payload.moodOverall,
    primaryGoals: payload.primaryGoals,
    primaryGoal: payload.primaryGoal,
  });

  return {
    fields: {
      userId,
      version: payload.version || "1.0",
      isCompleted: true,
      completedAt: new Date(),
      consentVersion: payload.consentVersion,
      consentTimestamp: new Date(),
      // The guest explicitly consented to personalised processing by accepting
      // the privacy notice, so the Snapshot service treats this as granted.
      consentType: payload.consentType,
      age: payload.age ?? null,
      menopausePhase: payload.menopausePhase ?? null,
      hormoneTherapyStatus: payload.hormoneTherapyStatus ?? null,
      primaryGoals: payload.primaryGoals,
      primaryHealthConcerns: payload.primaryHealthConcerns,
      symptomImpact: payload.symptomImpact ?? null,
      medicalConditions: payload.medicalConditions ?? null,
      moodBaseline: payload.moodBaseline,
      moodOverall: payload.moodOverall ?? null,
      moodPatterns: payload.moodPatterns,
      emotionalGoals: payload.emotionalGoals,
      meditationFrequency: payload.meditationFrequency ?? null,
      sleepQuality: payload.sleepQuality ?? null,
      sleepChallenges: payload.sleepChallenges,
      energyLevel: payload.energyLevel ?? null,
      energyPattern: payload.energyPattern ?? null,
      dietaryPreferences: payload.dietaryPreferences,
      allergies: payload.allergies ?? null,
      energyAfterMealRating: payload.energyAfterMealRating ?? null,
      activityLevel: payload.activityLevel ?? null,
      exercisePreferences: payload.exercisePreferences,
      weeklyExerciseMinutes: payload.weeklyExerciseMinutes ?? null,
      lifestyleFocus: payload.lifestyleFocus,
      primaryGoal: payload.primaryGoal ?? null,
      dailyCheckinOptIn: payload.dailyCheckinOptIn ?? true,
      preferredRecommendations: payload.preferredRecommendations,
      partnerSupportInterest: payload.partnerSupportInterest ?? null,
      partnerSupportNeeds: payload.partnerSupportNeeds,
      partnerEmail: payload.partnerEmail || null,
      partnerConsent: payload.partnerConsent ?? false,
      partnerSharingScopes: payload.partnerSharingScopes,
      deterministicScores: deterministicScores as unknown as Record<string, unknown>,
    },
    deterministicScores,
  };
}

function retentionMs(): number {
  return env.GUEST_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Removes expired, unclaimed guest accounts.
 *
 * Deleting the guest user cascades to its profile, Snapshot and claim, so this
 * is the whole cleanup. Claimed guests are excluded: once a visitor signs up the
 * row is their real account and its retention follows the ordinary account rules.
 *
 * Best-effort and never awaited on the request path — an abandoned-guest sweep is
 * housekeeping, and a failed sweep must not fail a live Snapshot request.
 */
export async function purgeExpiredGuests(): Promise<number> {
  try {
    const expired = await GuestSnapshotClaim.findAll({
      where: { expiresAt: { [Op.lt]: new Date() }, claimedAt: null },
      attributes: ["guestUserId"],
      limit: 200,
    });
    if (expired.length === 0) return 0;

    const guestIds = expired.map((claim) => claim.guestUserId);
    const removed = await User.destroy({
      where: { id: { [Op.in]: guestIds }, isGuest: true },
    });
    if (removed > 0) guestLog.info(`Purged ${removed} expired guest account(s).`);
    return removed;
  } catch (error) {
    guestLog.warn(
      "Expired guest purge failed. Housekeeping only; requests are unaffected.",
      error instanceof Error ? error.message : undefined,
    );
    return 0;
  }
}

export async function createGuestSnapshot(
  request: GuestSnapshotRequest,
): Promise<GuestSnapshotOutcome> {
  // Housekeeping is opportunistic: no scheduler, so the cheapest place to sweep
  // is alongside the request that creates new guests.
  void purgeExpiredGuests();

  const { subjectHash, ipHash, fingerprintHash } = subjectFor(
    request.ip,
    request.fingerprint,
  );

  const existing = await GuestSnapshotClaim.findOne({ where: { subjectHash } });
  if (existing) {
    return {
      ok: false,
      statusCode: 403,
      reason: "guest_limit_reached",
      message:
        "You've already used your free Snapshot on this device. Create a free account to keep your results and continue.",
    };
  }

  const guestEmail = `guest.${subjectHash.slice(0, 32)}@guest.hercompassai.local`;
  const expiresAt = new Date(Date.now() + retentionMs());

  let guestUserId: string;
  try {
    guestUserId = await sequelize.transaction(async (transaction) => {
      const guest = await User.create(
        {
          name: "Guest",
          email: guestEmail,
          passwordHash: null,
          role: "member",
          plan: "free",
          emailVerified: false,
          isGuest: true,
          guestSubjectHash: subjectHash,
        },
        { transaction },
      );

      const { fields } = buildProfileFields(guest.id, request.payload);
      await OnboardingProfile.create(fields, { transaction });

      await GuestSnapshotClaim.create(
        {
          subjectHash,
          guestUserId: guest.id,
          ipHash,
          fingerprintHash,
          expiresAt,
        },
        { transaction },
      );

      return guest.id;
    });
  } catch (error) {
    // A unique violation means two requests raced past the lookup above. The
    // second one loses the allowance, which is the intended outcome.
    guestLog.warn(
      "Guest Snapshot claim could not be created; treating as an already-used allowance.",
      error instanceof Error ? error.message : undefined,
    );
    return {
      ok: false,
      statusCode: 403,
      reason: "guest_limit_reached",
      message:
        "You've already used your free Snapshot on this device. Create a free account to keep your results and continue.",
    };
  }

  const outcome = await generatePersonalSnapshot({ userId: guestUserId, role: "member" });

  if (!outcome.ok) {
    // The allowance is only spent on a Snapshot the visitor actually receives.
    // Releasing it here keeps a transient engine outage from silently burning
    // someone's one free try; the endpoint's rate limiter still bounds retries.
    await GuestSnapshotClaim.destroy({ where: { subjectHash } }).catch(() => undefined);
    await User.destroy({ where: { id: guestUserId, isGuest: true } }).catch(() => undefined);
    return {
      ok: false,
      statusCode: outcome.statusCode,
      reason: "ai_unavailable",
      message: outcome.message,
    };
  }

  guestLog.info(
    `Guest Snapshot generated (request ${outcome.requestId}, generated ${outcome.generated}).`,
  );

  return {
    ok: true,
    snapshot: outcome.snapshot,
    generated: outcome.generated,
    requestId: outcome.requestId,
    claimToken: signGuestClaimToken({ guestUserId, subjectHash }),
    expiresAt: expiresAt.toISOString(),
  };
}
