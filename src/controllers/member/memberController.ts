import type { NextFunction, Response } from "express";
import { Op, type WhereOptions } from "sequelize";
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
import { buildAccountView } from "../../services/member/buildAccountView.js";
import { buildMemberInsights } from "../../services/member/buildInsights.js";
import {
  filterByPreferences,
  isNotificationCategory,
  NOTIFICATION_CATEGORIES,
} from "../../services/notifications/notificationPolicy.js";
import {
  countUnread,
  loadPreferences,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notifications/notificationService.js";
import {
  planComparison,
  planSummaries,
  planSummary,
  resolveMemberPlan,
} from "../../services/member/planCatalog.js";
import {
  clampHistoryWindow,
  entitlementsFor,
  readAiUsage,
} from "../../services/member/entitlements.js";
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
    // A Free member asking for 90 days receives the 30 their plan covers, rather
    // than an error. Clamping silently would be dishonest about what came back, so
    // the effective window is reported alongside the requested one.
    const requestedDays = rangeDays(req.query.range);
    const clamped = await clampHistoryWindow(
      { userId, role: req.user?.role },
      requestedDays
    );
    // `rangeDays` narrows to 7 | 30 | 90; the clamp can only return something
    // smaller, so re-narrow rather than widening the whole trend pipeline's types.
    const days: 7 | 30 | 90 = clamped === 7 ? 7 : clamped === 30 ? 30 : 90;
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
      // Present only when the plan shortened the window, so the client can say so
      // rather than showing a 90-day selector over 30 days of data.
      ...(days !== requestedDays
        ? {
            requestedRange: `${requestedDays}d`,
            limitNotice: `Your plan includes ${days} days of history.`,
          }
        : {}),
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

const NOTIFICATION_MAX_LIMIT = 100;
const NOTIFICATION_DEFAULT_LIMIT = 25;

/**
 * Parses the list query.
 *
 * A bad page size is reported rather than clamped, because silently returning
 * 100 rows to a request for `limit=0` looks like a bug to the caller.
 */
function notificationQuery(
  raw: AuthenticatedRequest["query"],
):
  | { limit: number; offset: number; category: string | null; unreadOnly: boolean }
  | { error: string } {
  const limitRaw = typeof raw.limit === "string" ? raw.limit : undefined;
  const offsetRaw = typeof raw.offset === "string" ? raw.offset : undefined;
  const categoryRaw = typeof raw.category === "string" ? raw.category : undefined;

  const limit = limitRaw === undefined ? NOTIFICATION_DEFAULT_LIMIT : Number(limitRaw);
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw);

  if (!Number.isInteger(limit) || limit < 1 || limit > NOTIFICATION_MAX_LIMIT) {
    return { error: `limit must be a whole number between 1 and ${NOTIFICATION_MAX_LIMIT}` };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { error: "offset must be zero or a positive whole number" };
  }

  let category: string | null = null;
  if (categoryRaw !== undefined && categoryRaw !== "" && categoryRaw !== "all") {
    if (!isNotificationCategory(categoryRaw)) {
      return { error: `category must be one of: ${NOTIFICATION_CATEGORIES.join(", ")}` };
    }
    category = categoryRaw;
  }

  const unreadRaw = typeof raw.unread === "string" ? raw.unread : "";
  const unreadOnly = unreadRaw === "1" || unreadRaw === "true";

  return { limit, offset, category, unreadOnly };
}

/** Shapes a row for the client, including the fields it needs to act. */
function notificationView(row: Notification) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    important: Boolean(row.important),
    targetUrl: row.targetUrl ?? null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export async function getMemberNotifications(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;

    const query = notificationQuery(req.query);
    if ("error" in query) {
      sendError(res, 400, query.error);
      return;
    }

    const where: WhereOptions<Notification> = { userId };
    if (query.unreadOnly) where.readAt = { [Op.is]: null };
    if (query.category) where.category = query.category;

    // The unread badge counts every unread notice, not just the page on screen,
    // so a filtered or paginated list cannot make the badge look wrong.
    const unreadCount = await Notification.count({
      where: { userId, readAt: null },
    });

    const rows = await Notification.findAndCountAll({
      where,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit: query.limit,
      offset: query.offset,
    });

    const visible = filterByPreferences(rows.rows, await loadPreferences(userId));

    sendSuccess(res, 200, "Notifications retrieved", {
      notifications: visible.map(notificationView),
      unreadCount,
      // Reported from the unfiltered, unpaged total so the client can tell
      // whether more pages remain behind the active filter.
      total: rows.count,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    next(error);
  }
}

export async function markMemberNotificationRead(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      sendError(res, 400, "Notification id is required");
      return;
    }
    const changed = await markNotificationRead(userId, id);
    if (!changed) {
      sendError(res, 404, "Notification not found");
      return;
    }
    sendSuccess(res, 200, "Notification marked as read", {
      id,
      unreadCount: await countUnread(userId),
    });
  } catch (error) {
    next(error);
  }
}

export async function markAllMemberNotificationsRead(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const markedRead = await markAllNotificationsRead(userId);
    sendSuccess(res, 200, "Notifications marked as read", {
      markedRead,
      unreadCount: 0,
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
    const usage = await readAiUsage({ userId, role: req.user?.role });
    sendSuccess(res, 200, "Subscription retrieved", {
      plan,
      label: `${current.label} Plan`,
      description: current.description,
      summary: current.summary,
      plans: planSummaries,
      comparison: planComparison,
      // Sent so the client can render locked sections and the remaining AI
      // allowance. Presentation only — the server enforces both regardless of
      // what this says.
      entitlements: entitlementsFor(plan),
      aiUsage: usage,
    });
  } catch (error) {
    next(error);
  }
}
