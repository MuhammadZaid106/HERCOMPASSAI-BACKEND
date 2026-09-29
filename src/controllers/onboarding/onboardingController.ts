import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { OnboardingProfile, SnapshotFeedback, SnapshotVersion, User } from "../../models/index.js";
import { onboardingPayloadSchema } from "./onboardingSchemas.js";
import { calculateDeterministicScores } from "../../services/onboarding/calculateScores.js";
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
 * Retrieve 8-part Personal Menopause Snapshot
 * GET /api/onboarding/snapshot
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

    const profile = await OnboardingProfile.findOne({
      where: { userId },
      include: [{ model: User, as: "user", attributes: ["name", "email", "plan"] }],
    });

    if (!profile || !profile.isCompleted) {
      sendError(
        res,
        404,
        "Please complete your 5-minute onboarding assessment first"
      );
      return;
    }

    const scores = (profile.deterministicScores || {}) as Record<string, any>;

    // Structured 8-part Snapshot Observations (SCI compliant, non-diagnostic observational language)
    const snapshot = {
      member: {
        name: (profile as any).user?.name || "Member",
        plan: (profile as any).user?.plan || "free",
      },
      completedAt: profile.completedAt,
      version: profile.version,
      deterministicMetrics: {
        symptomBurdenScore: scores.symptomBurdenScore ?? 45,
        sleepDisturbanceScore: scores.sleepDisturbanceScore ?? 40,
        vitalityIndex: scores.vitalityIndex ?? 60,
        emotionalBalanceScore: scores.emotionalBalanceScore ?? 65,
        dominantFocusArea: scores.dominantFocusArea ?? "Holistic Rhythm & Daily Baseline",
      },
      observations: [
        {
          id: 1,
          pillar: "Symptom Pattern",
          title: "Primary Observed Concerns",
          summary:
            profile.primaryHealthConcerns.length > 0
              ? `Your logs suggest focal patterns around: ${profile.primaryHealthConcerns.join(", ")}.`
              : "No acute symptom burdens were highlighted in your initial check-in.",
          impact: profile.symptomImpact || "moderate",
          evidenceNote: "Grounded in NAMS & ACOG observational symptom prevalence guidelines.",
        },
        {
          id: 2,
          pillar: "Mood & Emotional Baseline",
          title: "Emotional Wellbeing Rhythm",
          summary:
            "Your baseline shows resilience with occasional fluctuations. Prioritizing consistent morning sunlight and mindful breathing can support autonomic balance.",
          score: scores.emotionalBalanceScore ?? 65,
        },
        {
          id: 3,
          pillar: "Sleep Architecture",
          title: "Restorative Sleep Pattern",
          summary:
            profile.sleepChallenges.length > 0
              ? `Noted challenges with: ${profile.sleepChallenges.join(", ")}. Evening cooling and scheduled wind-down protocols may assist.`
              : "Sleep rhythm appears steady. Maintaining regular wake times will sustain this pattern.",
          score: scores.sleepDisturbanceScore ?? 40,
        },
        {
          id: 4,
          pillar: "Energy & Metabolic Rhythm",
          title: "Ultradian Energy Distribution",
          summary: `Energy tendency is noted as "${profile.energyLevel || "steady"}" with typical variance around "${profile.energyPattern || "the day"}".`,
          vitalityIndex: scores.vitalityIndex ?? 60,
        },
        {
          id: 5,
          pillar: "Lifestyle & Nutrition Context",
          title: "Nutrition & Movement Baseline",
          summary: `Activity level is currently categorized as "${profile.activityLevel || "moderate"}" with ${profile.weeklyExerciseMinutes || "30-60"} minutes of targeted exercise weekly.`,
          preferences: profile.dietaryPreferences,
        },
        {
          id: 6,
          pillar: "Personalized Recommendations",
          title: "Your First 3 High-Yield Steps",
          recommendations: [
            {
              action: "Evening Cooling & Screen Curfew",
              why: "Assists thermal regulation and supports natural melatonin release before sleep.",
              category: "Sleep & Vasomotor",
            },
            {
              action: "Mid-Day Protein & Fiber Anchor",
              why: "Minimizes post-meal glucose dips that often manifest as afternoon brain fog.",
              category: "Nutrition Radar",
            },
            {
              action: "3-Minute Box Breathing Reset",
              why: "Activates parasympathetic vagal tone to dampen acute vasomotor stress responses.",
              category: "Cooling & Breathwork",
            },
          ],
        },
        {
          id: 7,
          pillar: "Suggested Next Steps",
          title: "Your 7-Day Gentle Habit",
          action: "Log your 60-second Daily Check-in each morning to start training your personalized Trend Engine.",
        },
        {
          id: 8,
          pillar: "Partner Support Opportunity",
          title: "Couple & Partner Intelligence",
          status: profile.partnerConsent && profile.partnerEmail ? "Connected" : "Optional / Private",
          summary:
            profile.partnerConsent && profile.partnerEmail
              ? `Partner digest enabled for ${profile.partnerEmail}. Scoped sharing strictly limits access to weekly actionable communication summaries.`
              : "Partner sharing is currently private. You can invite a trusted partner whenever you choose.",
        },
      ],
      safetyNotice:
        "HerCompassAI provides empathetic, non-diagnostic observational insights and lifestyle education. It is not a medical diagnosis or treatment plan.",
    };

    sendSuccess(res, 200, "Personal Menopause Snapshot retrieved", { snapshot });
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
