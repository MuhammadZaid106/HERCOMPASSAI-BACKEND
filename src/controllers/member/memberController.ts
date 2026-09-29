import type { NextFunction, Response } from "express";
import { Op } from "sequelize";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  Notification,
  OnboardingProfile,
  SleepEntry,
  SymptomEntry,
  User,
} from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { calculateMemberTrends } from "../../services/intelligence/index.js";
import { filterMemberNotifications } from "./memberLibraryController.js";
import { buildAccountView } from "../../services/member/buildAccountView.js";
import { buildMemberInsights } from "../../services/member/buildInsights.js";
import {
  planComparison,
  planSummaries,
  planSummary,
  resolveMemberPlan,
} from "../../services/member/planCatalog.js";
import {
  buildDashboardHomeView,
  calendarTodayKey,
  entryDateKey,
  SLEEP_QUALITY_POINTS,
} from "../../services/member/dashboardHome.js";

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (req.user.role !== "member") {
    sendError(res, 403, "Only member accounts can access the member dashboard");
    return null;
  }
  return req.user.userId;
}

function rangeDays(value: unknown): 7 | 30 | 90 {
  return value === "30d" ? 30 : value === "90d" ? 90 : 7;
}

function startDate(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

function average(values: number[]): number | null {
  return values.length
    ? Math.round(
        (values.reduce((total, value) => total + value, 0) / values.length) *
          10,
      ) / 10
    : null;
}

function streakLookbackStart(): Date {
  return startDate(90);
}

async function collectLoggedDates(
  userId: string,
  since: Date,
): Promise<string[]> {
  const dateWhere = { userId, entryDate: { [Op.gte]: since } };
  const [symptoms, moods, sleep, energy, lifestyle] = await Promise.all([
    SymptomEntry.findAll({ where: dateWhere, attributes: ["entryDate"] }),
    MoodEntry.findAll({ where: dateWhere, attributes: ["entryDate"] }),
    SleepEntry.findAll({ where: dateWhere, attributes: ["entryDate"] }),
    EnergyEntry.findAll({ where: dateWhere, attributes: ["entryDate"] }),
    LifestyleEntry.findAll({ where: dateWhere, attributes: ["entryDate"] }),
  ]);
  const dates = new Set<string>();
  for (const row of [
    ...symptoms,
    ...moods,
    ...sleep,
    ...energy,
    ...lifestyle,
  ]) {
    dates.add(row.entryDate);
  }
  return [...dates];
}

export async function getMemberDashboard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const weekStart = startDate(7);
    const weekWhere = { userId, entryDate: { [Op.gte]: weekStart } };
    const [
      user,
      profile,
      latestSymptom,
      latestMood,
      latestSleep,
      latestEnergy,
      weekSymptoms,
      weekMoods,
      weekSleep,
      weekEnergy,
      loggedDates,
    ] = await Promise.all([
      User.findByPk(userId, { attributes: ["id", "name", "plan"] }),
      OnboardingProfile.findOne({
        where: { userId },
        attributes: [
          "isCompleted",
          "completedAt",
          "deterministicScores",
          "partnerSupportInterest",
        ],
      }),
      SymptomEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      MoodEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      SleepEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      EnergyEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      SymptomEntry.findAll({ where: weekWhere, order: [["entryDate", "ASC"]] }),
      MoodEntry.findAll({ where: weekWhere, order: [["entryDate", "ASC"]] }),
      SleepEntry.findAll({ where: weekWhere, order: [["entryDate", "ASC"]] }),
      EnergyEntry.findAll({ where: weekWhere, order: [["entryDate", "ASC"]] }),
      collectLoggedDates(userId, streakLookbackStart()),
    ]);
    if (!user) {
      sendError(res, 404, "Member account not found");
      return;
    }

    const home = buildDashboardHomeView({
      todayKey: calendarTodayKey(),
      snapshotCompleted: Boolean(profile?.isCompleted),
      deterministicScores: profile?.deterministicScores ?? null,
      latestSymptom,
      latestMood,
      latestSleep,
      latestEnergy,
    });
    const trends = calculateMemberTrends({
      rangeDays: 7,
      symptomPoints: weekSymptoms.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.symptoms.length,
      })),
      moodPoints: weekMoods.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.moodLevel,
      })),
      sleepPoints: weekSleep.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: SLEEP_QUALITY_POINTS[entry.quality],
      })),
      energyPoints: weekEnergy.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.energyLevel,
      })),
      loggedDates,
    });

    sendSuccess(res, 200, "Member dashboard retrieved", {
      member: user,
      onboarding: {
        completed: Boolean(profile?.isCompleted),
        completedAt: profile?.completedAt ?? null,
        snapshotAvailable: Boolean(profile?.isCompleted),
      },
      today: home.today,
      latest: home.latest,
      checkIn: home.checkIn,
      snapshot: home.snapshot,
      nextStep: home.nextStep,
      trends,
      deterministicScores: profile?.deterministicScores ?? null,
      partnerSupport: {
        interest: profile?.partnerSupportInterest ?? null,
      },
      trackingSummary: {
        checkInStreak: trends.checkInStreak,
        consistencyScore7d: trends.consistencyScore,
        daysWithAnyEntry7d: trends.daysWithAnyEntry,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMemberProgress(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const days = rangeDays(req.query.range);
    const where = { userId, entryDate: { [Op.gte]: startDate(days) } };
    const [symptoms, moods, sleep, energy, lifestyle, loggedDates] =
      await Promise.all([
        SymptomEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
        MoodEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
        SleepEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
        EnergyEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
        LifestyleEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
        collectLoggedDates(userId, streakLookbackStart()),
      ]);
    const symptomPoints = symptoms.map((entry) => ({
      date: entryDateKey(entry.entryDate),
      value: entry.symptoms.length,
    }));
    const moodPoints = moods.map((entry) => ({
      date: entryDateKey(entry.entryDate),
      value: entry.moodLevel,
    }));
    const sleepPoints = sleep.map((entry) => ({
      date: entryDateKey(entry.entryDate),
      value: SLEEP_QUALITY_POINTS[entry.quality],
    }));
    const energyPoints = energy.map((entry) => ({
      date: entryDateKey(entry.entryDate),
      value: entry.energyLevel,
    }));
    const trends = calculateMemberTrends({
      rangeDays: days,
      symptomPoints,
      moodPoints,
      sleepPoints,
      energyPoints,
      loggedDates,
    });

    sendSuccess(res, 200, "Member progress retrieved", {
      range: `${days}d`,
      points: {
        symptoms: symptomPoints,
        mood: moodPoints,
        sleep: sleepPoints,
        energy: energyPoints,
      },
      averages: {
        symptoms: average(symptomPoints.map((point) => point.value)),
        mood: average(moodPoints.map((point) => point.value)),
        sleep: average(sleepPoints.map((point) => point.value)),
        energy: average(energyPoints.map((point) => point.value)),
      },
      entryCount:
        symptoms.length +
        moods.length +
        sleep.length +
        energy.length +
        lifestyle.length,
      trends,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMemberInsights(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const days = 30;
    const where = { userId, entryDate: { [Op.gte]: startDate(days) } };
    const [symptoms, moods, sleep, energy, loggedDates] = await Promise.all([
      SymptomEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      MoodEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      SleepEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      EnergyEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      collectLoggedDates(userId, streakLookbackStart()),
    ]);
    const trends = calculateMemberTrends({
      rangeDays: days,
      symptomPoints: symptoms.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.symptoms.length,
      })),
      moodPoints: moods.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.moodLevel,
      })),
      sleepPoints: sleep.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: SLEEP_QUALITY_POINTS[entry.quality],
      })),
      energyPoints: energy.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.energyLevel,
      })),
      loggedDates,
    });
    sendSuccess(
      res,
      200,
      "Member insights retrieved",
      buildMemberInsights(trends),
    );
  } catch (error) {
    next(error);
  }
}

export async function getMemberNotifications(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const stored = await Notification.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    const notifications = await filterMemberNotifications(userId, stored);
    sendSuccess(res, 200, "Notifications retrieved", {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.readAt)
        .length,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMemberAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const [user, profile, unreadCount] = await Promise.all([
      User.findByPk(userId, {
        attributes: ["id", "name", "email", "plan", "emailVerified", "createdAt"],
      }),
      OnboardingProfile.findOne({ where: { userId } }),
      Notification.count({ where: { userId, readAt: null } }),
    ]);
    if (!user) {
      sendError(res, 404, "Member account not found");
      return;
    }
    sendSuccess(
      res,
      200,
      "Member account retrieved",
      buildAccountView({
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        plan: user.plan,
        unreadCount,
        profile: profile
          ? {
              isCompleted: profile.isCompleted,
              consentType: profile.consentType,
              consentVersion: profile.consentVersion,
              consentTimestamp: profile.consentTimestamp,
              dailyCheckinOptIn: profile.dailyCheckinOptIn,
              preferredRecommendations: profile.preferredRecommendations ?? [],
              partnerSupportInterest: profile.partnerSupportInterest,
              partnerConsent: profile.partnerConsent,
              partnerSharingScopes: profile.partnerSharingScopes ?? [],
              partnerEmail: profile.partnerEmail,
            }
          : null,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getMemberSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const user = await User.findByPk(userId, { attributes: ["id", "plan"] });
    if (!user) {
      sendError(res, 404, "Member account not found");
      return;
    }
    const plan = resolveMemberPlan(user.plan);
    const current = planSummary(plan);
    sendSuccess(res, 200, "Subscription retrieved", {
      plan,
      label: `${current.label} Plan`,
      description: current.description,
      summary: current.summary,
      plans: planSummaries,
      comparison: planComparison,
    });
  } catch (error) {
    next(error);
  }
}
