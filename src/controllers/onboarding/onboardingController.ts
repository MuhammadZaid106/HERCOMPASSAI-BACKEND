import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { OnboardingProfile, SnapshotFeedback, SnapshotVersion } from "../../models/index.js";
import { onboardingPayloadSchema } from "./onboardingSchemas.js";
import { calculateDeterministicScores } from "../../services/onboarding/calculateScores.js";
import { generatePersonalSnapshot } from "../../services/onboarding/personalSnapshotService.js";
import { notifyMember } from "../../services/notifications/notificationService.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

/**
 * Submit or update onboarding assessment
 * POST /api/onboarding
 */
export async function submitOnboarding(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (req.user?.role !== "member") {
      sendError(res, 403, "Only member accounts can submit onboarding assessments.");
      return;
    }

    // 1. Zod runtime validation
    const parsedData = onboardingPayloadSchema.parse(req.body);

    // 2. Deterministic calculations (Deterministic Software Calculates)
    const deterministicScores = calculateDeterministicScores({
      primaryHealthConcerns: parsedData.primaryHealthConcerns,
      symptomImpact: parsedData.symptomImpact,
      sleepQuality: parsedData.sleepQuality,
      sleepChallenges: parsedData.sleepChallenges,
      energyLevel: parsedData.energyLevel,
      activityLevel: parsedData.activityLevel,
      weeklyExerciseMinutes: parsedData.weeklyExerciseMinutes,
      energyAfterMealRating: parsedData.energyAfterMealRating,
      moodBaseline: parsedData.moodBaseline,
      moodOverall: parsedData.moodOverall,
      primaryGoals: parsedData.primaryGoals,
      primaryGoal: parsedData.primaryGoal,
    });

    const isCompleted = parsedData.isCompleted ?? true;
    const completedAt = isCompleted ? new Date() : null;

    // 3. Upsert into database
    let profile = await OnboardingProfile.findOne({ where: { userId } });

    const profileData = {
      userId,
      version: parsedData.version || "1.0",
      isCompleted,
      completedAt,
      consentVersion: parsedData.consentVersion,
      consentTimestamp: new Date(),
      consentType: parsedData.consentType,
      age: parsedData.age ?? null,
      menopausePhase: parsedData.menopausePhase ?? null,
      hormoneTherapyStatus: parsedData.hormoneTherapyStatus ?? null,
      primaryGoals: parsedData.primaryGoals,
      primaryHealthConcerns: parsedData.primaryHealthConcerns,
      symptomImpact: parsedData.symptomImpact ?? null,
      medicalConditions: parsedData.medicalConditions ?? null,
      moodBaseline: parsedData.moodBaseline,
      moodOverall: parsedData.moodOverall ?? null,
      moodPatterns: parsedData.moodPatterns,
      emotionalGoals: parsedData.emotionalGoals,
      meditationFrequency: parsedData.meditationFrequency ?? null,
      sleepQuality: parsedData.sleepQuality ?? null,
      sleepChallenges: parsedData.sleepChallenges,
      energyLevel: parsedData.energyLevel ?? null,
      energyPattern: parsedData.energyPattern ?? null,
      dietaryPreferences: parsedData.dietaryPreferences,
      allergies: parsedData.allergies ?? null,
      energyAfterMealRating: parsedData.energyAfterMealRating ?? null,
      activityLevel: parsedData.activityLevel ?? null,
      exercisePreferences: parsedData.exercisePreferences,
      weeklyExerciseMinutes: parsedData.weeklyExerciseMinutes ?? null,
      lifestyleFocus: parsedData.lifestyleFocus,
      primaryGoal: parsedData.primaryGoal ?? null,
      dailyCheckinOptIn: parsedData.dailyCheckinOptIn ?? true,
      preferredRecommendations: parsedData.preferredRecommendations,
      partnerSupportInterest: parsedData.partnerSupportInterest ?? null,
      partnerSupportNeeds: parsedData.partnerSupportNeeds,
      partnerEmail: parsedData.partnerEmail || null,
      partnerConsent: parsedData.partnerConsent ?? false,
      partnerSharingScopes: parsedData.partnerSharingScopes,
      deterministicScores: deterministicScores as unknown as Record<string, unknown>,
    };

    if (profile) {
      await profile.update(profileData);
    } else {
      profile = await OnboardingProfile.create(profileData);
    }

    if (isCompleted) {
      const versionCount = await SnapshotVersion.count({ where: { userId } });
      await SnapshotVersion.create({
        userId,
        versionNumber: versionCount + 1,
        completedAt: completedAt ?? new Date(),
        dominantFocusArea: deterministicScores.dominantFocusArea,
        scores: {
          symptomBurdenScore: deterministicScores.symptomBurdenScore,
          sleepDisturbanceScore: deterministicScores.sleepDisturbanceScore,
          vitalityIndex: deterministicScores.vitalityIndex,
          emotionalBalanceScore: deterministicScores.emotionalBalanceScore,
        },
      });

      // The first completion is a milestone and reads differently from a
      // re-take, so the wording follows the version count rather than claiming
      // "your Snapshot is ready" on every edit.
      await notifyMember({
        userId,
        category: "snapshot",
        title: versionCount === 0 ? "Your Snapshot is ready" : "Snapshot updated",
        body:
          versionCount === 0
            ? "Your baseline has been calculated. Open it to see where you are starting from."
            : "Your latest answers have been scored and added to your history.",
        targetUrl: "/app/snapshot",
      });
    }

    logger.info(
      `[ONBOARDING] Successfully saved assessment for user ${userId} (completed: ${isCompleted})`
    );

    sendSuccess(
      res,
      200,
      "Onboarding assessment saved successfully",
      {
        profile: {
          id: profile.id,
          userId: profile.userId,
          isCompleted: profile.isCompleted,
          completedAt: profile.completedAt,
          deterministicScores: profile.deterministicScores,
          dominantFocusArea: deterministicScores.dominantFocusArea,
        },
      }
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve current member onboarding state
 * GET /api/onboarding/me
 */
export async function getOnboardingProfile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (req.user?.role !== "member") {
      sendError(res, 403, "Onboarding profiles are only available to member accounts.");
      return;
    }

    const profile = await OnboardingProfile.findOne({
      where: { userId },
      attributes: { exclude: ["createdAt", "updatedAt"] },
    });

    if (!profile) {
      sendSuccess(
        res,
        200,
        "No completed onboarding found",
        { isCompleted: false, profile: null }
      );
      return;
    }

    sendSuccess(
      res,
      200,
      "Profile retrieved",
      { isCompleted: profile.isCompleted, profile }
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve the 8-part Personal Menopause Snapshot
 * GET /api/onboarding/snapshot
 * GET /api/onboarding/snapshot?refresh=true
 *
 * This is a generated artifact, not a template. The read path runs the AI
 * Gateway — the same `runGateway` invocation the AI Lab exercises — and replays
 * the stored result until the member's consent, baseline or logged trends
 * change. It is the only member-facing screen that produces AI content, so it is
 * also the only place that has to distinguish "you have not finished onboarding"
 * from "the intelligence service is unavailable".
 */
export async function getPersonalSnapshot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (req.user?.role !== "member") {
      sendError(
        res,
        403,
        "Personal Menopause Snapshots are private to member accounts."
      );
      return;
    }

    const outcome = await generatePersonalSnapshot({
      userId,
      role: "member",
      force: req.query.refresh === "true",
    });

    if (!outcome.ok) {
      sendError(res, outcome.statusCode, outcome.message, { reason: outcome.reason });
      return;
    }

    // The service owns assembly, storage and provenance; this layer only presents.
    //
    // The eight sections used to be rebuilt here as literals against a `profile`
    // variable that no longer existed in this scope, so the Snapshot endpoint did
    // not compile and the AI wording was unreachable. `generated` distinguishes a
    // freshly built Snapshot from a replayed one, which is what the member-facing
    // provenance panel labels, so it travels with the payload.
    sendSuccess(res, 200, "Personal Menopause Snapshot retrieved", {
      snapshot: outcome.snapshot,
      generated: outcome.generated,
      requestId: outcome.requestId,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSnapshotVersions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    if (req.user?.role !== "member") {
      sendError(res, 403, "Only member accounts can view Snapshot versions");
      return;
    }
    let versions = await SnapshotVersion.findAll({
      where: { userId },
      order: [["versionNumber", "DESC"]],
    });
    if (versions.length === 0) {
      const profile = await OnboardingProfile.findOne({ where: { userId } });
      const scores = profile?.deterministicScores;
      if (profile?.isCompleted && scores && typeof scores === "object") {
        const record = scores as Record<string, unknown>;
        await SnapshotVersion.create({
          userId,
          versionNumber: 1,
          completedAt: profile.completedAt ?? profile.updatedAt ?? new Date(),
          dominantFocusArea:
            typeof record.dominantFocusArea === "string" ? record.dominantFocusArea : null,
          scores: {
            symptomBurdenScore: record.symptomBurdenScore ?? null,
            sleepDisturbanceScore: record.sleepDisturbanceScore ?? null,
            vitalityIndex: record.vitalityIndex ?? null,
            emotionalBalanceScore: record.emotionalBalanceScore ?? null,
          },
        });
        versions = await SnapshotVersion.findAll({
          where: { userId },
          order: [["versionNumber", "DESC"]],
        });
      }
    }
    sendSuccess(res, 200, "Snapshot versions retrieved", {
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        completedAt: version.completedAt,
        dominantFocusArea: version.dominantFocusArea,
        scores: version.scores,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function submitSnapshotFeedback(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    if (req.user?.role !== "member") {
      sendError(res, 403, "Only member accounts can leave Snapshot feedback");
      return;
    }
    const rating = req.body?.rating;
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (rating !== "helpful" && rating !== "not_helpful") {
      sendError(res, 400, "Choose whether this Snapshot was helpful");
      return;
    }
    if (comment.length > 1000) {
      sendError(res, 400, "Keep the note under 1000 characters");
      return;
    }
    const latest = await SnapshotVersion.findOne({
      where: { userId },
      order: [["versionNumber", "DESC"]],
    });
    const feedback = await SnapshotFeedback.create({
      userId,
      snapshotVersionId: latest?.id ?? null,
      rating,
      comment: comment || null,
    });
    logger.info(`[ONBOARDING] Snapshot feedback ${feedback.id} saved for user ${userId}`);
    sendSuccess(res, 201, "Thank you. Your feedback has been saved", { id: feedback.id });
  } catch (error) {
    next(error);
  }
}
