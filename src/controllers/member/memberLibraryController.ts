import type { NextFunction, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import {
  ExploreProgress,
  NotificationPreference,
  OnboardingProfile,
  SupportRequest,
  User,
} from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import { syncPartnerInvite } from "../../services/partner/partnerInviteService.js";

const libraryLog = logger.module("MEMBER-LIBRARY");

const EXPLORE_SLUGS = new Set([
  "understanding-sleep-changes",
  "mood-beside-sleep",
  "energy-across-the-day",
  "a-steady-plate",
  "low-impact-movement",
  "a-short-reset",
  "talking-about-what-you-notice",
  "what-a-phase-label-means",
  "what-a-partner-can-see",
  "support-without-the-raw-log",
  "where-guidance-comes-from",
]);

const SHARE_SCOPES = [
  "general_support",
  "shared_activities",
  "communication_guidance",
] as const;

const SUPPORT_TOPICS = [
  "getting_started",
  "snapshot",
  "tracking",
  "partner_support",
  "subscription",
  "privacy",
  "ai_insights",
] as const;

const preferenceSchema = z.object({
  snapshot: z.boolean(),
  trackingReminders: z.boolean(),
  recommendations: z.boolean(),
  partner: z.boolean(),
  plans: z.boolean(),
  account: z.boolean(),
  privacySecurity: z.boolean(),
});

const exploreSchema = z.object({
  saved: z.boolean(),
  completed: z.boolean(),
});

const supportSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string().trim().min(8).max(2000),
});

const partnerSchema = z.object({
  partnerEmail: z.union([z.literal(""), z.string().trim().email()]).optional(),
  partnerConsent: z.boolean(),
  scopes: z.array(z.enum(SHARE_SCOPES)).max(3),
});

const deleteSchema = z.object({
  confirmEmail: z.string().trim().email(),
});

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (req.user.role !== "member") {
    sendError(res, 403, "Only member accounts can use this page");
    return null;
  }
  return req.user.userId;
}

function preferenceView(row: NotificationPreference) {
  return {
    snapshot: row.snapshot,
    trackingReminders: row.trackingReminders,
    recommendations: row.recommendations,
    partner: row.partner,
    plans: row.plans,
    account: row.account,
    privacySecurity: row.privacySecurity,
  };
}

async function preferenceRow(userId: string): Promise<NotificationPreference> {
  const [row] = await NotificationPreference.findOrCreate({
    where: { userId },
    defaults: { userId },
  });
  return row;
}

export async function getNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const row = await preferenceRow(userId);
    sendSuccess(res, 200, "Notification preferences retrieved", preferenceView(row));
  } catch (error) {
    next(error);
  }
}

export async function updateNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = preferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Invalid notification preferences");
      return;
    }
    const row = await preferenceRow(userId);
    await row.update(parsed.data);
    libraryLog.info(`[${new Date().toISOString()}] notification preferences updated for ${userId}`);
    sendSuccess(res, 200, "Notification preferences saved", preferenceView(row));
  } catch (error) {
    next(error);
  }
}

export async function getExploreProgress(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const rows = await ExploreProgress.findAll({ where: { userId } });
    sendSuccess(res, 200, "Explore progress retrieved", {
      items: rows.map((row) => ({
        slug: row.slug,
        saved: Boolean(row.savedAt),
        completed: Boolean(row.completedAt),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateExploreProgress(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const slug = String(req.params.slug ?? "");
    if (!EXPLORE_SLUGS.has(slug)) {
      sendError(res, 404, "That note is not in the library");
      return;
    }
    const parsed = exploreSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Invalid explore progress");
      return;
    }
    const [row] = await ExploreProgress.findOrCreate({
      where: { userId, slug },
      defaults: { userId, slug },
    });
    await row.update({
      savedAt: parsed.data.saved ? row.savedAt ?? new Date() : null,
      completedAt: parsed.data.completed ? row.completedAt ?? new Date() : null,
    });
    sendSuccess(res, 200, "Explore progress saved", {
      slug,
      saved: Boolean(row.savedAt),
      completed: Boolean(row.completedAt),
    });
  } catch (error) {
    next(error);
  }
}

export async function createSupportRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = supportSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Tell us a topic and a short message");
      return;
    }
    const request = await SupportRequest.create({
      userId,
      topic: parsed.data.topic,
      message: parsed.data.message,
    });
    libraryLog.info(`[${new Date().toISOString()}] support request ${request.id} from ${userId}`);
    sendSuccess(res, 201, "Your message has been saved", { id: request.id });
  } catch (error) {
    next(error);
  }
}

export async function updatePartnerSettings(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Invalid partner settings");
      return;
    }
    const profile = await OnboardingProfile.findOne({ where: { userId } });
    if (!profile) {
      sendError(res, 404, "Finish your Snapshot before setting partner support");
      return;
    }
    if (parsed.data.partnerConsent && parsed.data.scopes.length === 0) {
      sendError(res, 400, "Choose at least one thing a partner may receive");
      return;
    }
    await profile.update({
      partnerEmail: parsed.data.partnerEmail?.trim() || null,
      partnerConsent: parsed.data.partnerConsent,
      partnerSharingScopes: parsed.data.partnerConsent ? [...parsed.data.scopes] : [],
    });
    const invite = await syncPartnerInvite({
      memberUserId: userId,
      partnerEmail: profile.partnerEmail,
      consent: profile.partnerConsent,
      scopes: profile.partnerSharingScopes ?? [],
    });
    libraryLog.info(`[${new Date().toISOString()}] partner settings updated for ${userId}`);
    sendSuccess(res, 200, "Partner settings saved", {
      partnerConsent: profile.partnerConsent,
      scopes: profile.partnerSharingScopes ?? [],
      emailOnFile: Boolean(profile.partnerEmail?.trim()),
      inviteSent: invite.inviteSent,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMemberAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Confirm with the email on this account");
      return;
    }
    const user = await User.findByPk(userId);
    if (!user) {
      sendError(res, 404, "Member account not found");
      return;
    }
    if (user.email.toLowerCase() !== parsed.data.confirmEmail.toLowerCase()) {
      sendError(res, 400, "That email does not match this account");
      return;
    }
    await user.destroy();
    libraryLog.info(`[${new Date().toISOString()}] member account deleted ${userId}`);
    sendSuccess(res, 200, "Your account has been deleted", null);
  } catch (error) {
    next(error);
  }
}

const CATEGORY_PREF: Record<string, keyof z.infer<typeof preferenceSchema>> = {
  snapshot: "snapshot",
  tracking: "trackingReminders",
  recommendation: "recommendations",
  partner: "partner",
  plan: "plans",
  account: "account",
};

export async function filterMemberNotifications<T extends { category: string }>(
  userId: string,
  notifications: T[],
): Promise<T[]> {
  const row = await NotificationPreference.findOne({ where: { userId } });
  if (!row) return notifications;
  return notifications.filter((item) => {
    const key = CATEGORY_PREF[item.category];
    return key ? Boolean(row[key]) : true;
  });
}
