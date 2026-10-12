import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  Notification,
  NotificationPreference,
  OnboardingProfile,
  PartnerInvite,
  PartnerLessonProgress,
  PersonalSnapshot,
  SleepEntry,
  SupportRequest,
  SymptomEntry,
  User,
} from "../../models/index.js";

/**
 * Portable copy of *this* member's data for download.
 * Never includes another person's health logs, partner digest content, or secrets.
 */
export async function buildMemberDataExport(userId: string): Promise<Record<string, unknown>> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "name", "email", "role", "plan", "emailVerified", "createdAt", "updatedAt"],
  });
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const [
    onboarding,
    symptoms,
    moods,
    sleep,
    energy,
    lifestyle,
    snapshot,
    invitesSent,
    notifications,
    notificationPrefs,
    support,
    lessonProgress,
  ] = await Promise.all([
    OnboardingProfile.findOne({ where: { userId } }),
    SymptomEntry.findAll({ where: { userId }, order: [["entryDate", "DESC"]], limit: 500 }),
    MoodEntry.findAll({ where: { userId }, order: [["entryDate", "DESC"]], limit: 500 }),
    SleepEntry.findAll({ where: { userId }, order: [["entryDate", "DESC"]], limit: 500 }),
    EnergyEntry.findAll({ where: { userId }, order: [["entryDate", "DESC"]], limit: 500 }),
    LifestyleEntry.findAll({ where: { userId }, order: [["entryDate", "DESC"]], limit: 500 }),
    PersonalSnapshot.findOne({ where: { userId } }),
    PartnerInvite.findAll({
      where: { memberUserId: userId },
      attributes: ["id", "partnerEmail", "status", "scopes", "createdAt", "updatedAt"],
      order: [["createdAt", "DESC"]],
      limit: 50,
    }),
    Notification.findAll({
      where: { userId },
      attributes: ["id", "category", "title", "body", "readAt", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 200,
    }),
    NotificationPreference.findOne({ where: { userId } }),
    SupportRequest.findAll({
      where: { userId },
      attributes: ["id", "topic", "message", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 100,
    }),
    PartnerLessonProgress.findAll({
      where: { partnerUserId: userId },
      attributes: ["lessonSlug", "readAt"],
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: "1.0",
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    onboarding: onboarding
      ? {
          menopausePhase: onboarding.menopausePhase,
          primaryHealthConcerns: onboarding.primaryHealthConcerns,
          primaryGoals: onboarding.primaryGoals,
          emotionalGoals: onboarding.emotionalGoals,
          consentType: onboarding.consentType,
          consentVersion: onboarding.consentVersion,
          consentTimestamp: onboarding.consentTimestamp,
          partnerConsent: onboarding.partnerConsent,
          partnerSharingScopes: onboarding.partnerSharingScopes,
          dailyCheckinOptIn: onboarding.dailyCheckinOptIn,
          createdAt: onboarding.createdAt,
          updatedAt: onboarding.updatedAt,
        }
      : null,
    tracking: {
      symptoms: symptoms.map((row) => row.toJSON()),
      moods: moods.map((row) => row.toJSON()),
      sleep: sleep.map((row) => row.toJSON()),
      energy: energy.map((row) => row.toJSON()),
      lifestyle: lifestyle.map((row) => row.toJSON()),
    },
    snapshot: snapshot
      ? {
          id: snapshot.id,
          version: snapshot.version,
          resultStatus: snapshot.resultStatus,
          generatedAt: snapshot.generatedAt,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          // Member-owned narrative / scores only — no other users' data.
          payload: snapshot.payload,
        }
      : null,
    partnerInvitesSent: invitesSent.map((row) => row.toJSON()),
    academyProgress: lessonProgress.map((row) => row.toJSON()),
    notifications: notifications.map((row) => row.toJSON()),
    notificationPreferences: notificationPrefs?.toJSON() ?? null,
    supportRequests: support.map((row) => row.toJSON()),
    notes: [
      "This file contains only your account data.",
      "Partner digests and other people's health logs are never included.",
      "Passwords and session tokens are never included.",
    ],
  };
}
