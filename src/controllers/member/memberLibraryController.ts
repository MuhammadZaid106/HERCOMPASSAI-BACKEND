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
import { filterByPreferences } from "../../services/notifications/notificationPolicy.js";
import { loadPreferences, notifyMember } from "../../services/notifications/notificationService.js";

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

/**
 * Editable profile fields.
 *
 * Email is deliberately absent. Changing the address on an account is an
 * ownership transfer, and doing it without sending a confirmation to the new
 * address would let anyone who can reach the settings page take the account over
 * — they would receive the reset link for a password they chose. Email stays
 * read-only here until a verified-email change flow exists.
 */
const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters"),
});

const accountPreferencesSchema = z.object({
  dailyCheckIn: z.boolean(),
});

/**
 * Consent, as the member themselves states it.
 *
 * `consentVersion` is supplied by the client because the document a member
 * accepts is the one the browser displayed; the server records which version was
 * agreed to rather than assuming the current one.
 */
const consentSchema = z.object({
  allowsPersonalization: z.boolean(),
  consentVersion: z.string().trim().min(1, "A consent version is required").max(20),
});

/**
 * The only consent type that authorises personalised AI processing.
 *
 * Kept in step with `personalSnapshotService`, which treats anything outside
 * this set as revoked. Granting writes the same value onboarding records, so a
 * member who turns personalization back on is indistinguishable from one who
 * accepted it during onboarding.
 */
const PERSONALIZATION_CONSENT_TYPE = "wellness_personalization";
/**
 * Written on withdrawal. The AI Gateway reads the type, not a separate flag, so
 * revocation has to be expressed as a type it will not recognise — and it is not
 * the onboarding-only literal, which would require re-running the questionnaire.
 */
const ASSESSMENT_ONLY_CONSENT_TYPE = "assessment_only";

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
    // Captured before the write so the notice only fires on a real change, not
    // every time the same settings are saved again.
    const wasSharing = Boolean(profile.partnerConsent);
    await profile.update({
      partnerEmail: parsed.data.partnerEmail?.trim() || null,
      partnerConsent: parsed.data.partnerConsent,
      partnerSharingScopes: parsed.data.partnerConsent ? [...parsed.data.scopes] : [],
    });
    libraryLog.info(`[${new Date().toISOString()}] partner settings updated for ${userId}`);
    if (wasSharing !== Boolean(profile.partnerConsent)) {
      await notifyMember({
        userId,
        category: "partner",
        title: profile.partnerConsent ? "Partner sharing turned on" : "Partner sharing turned off",
        body: profile.partnerConsent
          ? "A partner can now receive the summary you chose. Your raw logs stay private."
          : "A partner can no longer receive anything from this account.",
        targetUrl: "/app/partner",
      });
    }
    sendSuccess(res, 200, "Partner settings saved", {
      partnerConsent: profile.partnerConsent,
      scopes: profile.partnerSharingScopes ?? [],
      emailOnFile: Boolean(profile.partnerEmail?.trim()),
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

/**
 * PUT /api/member/account/profile
 *
 * Name only. See `profileSchema` for why email is not editable.
 */
export async function updateMemberProfile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Check the name and try again", parsed.error.flatten().fieldErrors);
      return;
    }
    const user = await User.findByPk(userId);
    if (!user) {
      sendError(res, 404, "Member account not found");
      return;
    }
    await user.update({ name: parsed.data.name });
    libraryLog.info(`[${new Date().toISOString()}] profile name updated for ${userId}`);
    sendSuccess(res, 200, "Profile updated", {
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/member/account/preferences
 *
 * Tracking cadence. Requires a completed Snapshot, because the onboarding row is
 * where this preference lives.
 */
export async function updateAccountPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = accountPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Invalid account preferences", parsed.error.flatten().fieldErrors);
      return;
    }
    const profile = await OnboardingProfile.findOne({ where: { userId } });
    if (!profile?.isCompleted) {
      sendError(res, 404, "Finish your Snapshot before setting these preferences");
      return;
    }
    await profile.update({ dailyCheckinOptIn: parsed.data.dailyCheckIn });
    libraryLog.info(
      `[${new Date().toISOString()}] account preferences updated for ${userId}`,
    );
    sendSuccess(res, 200, "Account preferences saved", {
      dailyCheckIn: Boolean(profile.dailyCheckinOptIn),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/member/account/consent
 *
 * Grants or withdraws permission for AI text to be personalised from the
 * member's own entries.
 *
 * Withdrawing is a supported action, not an omission: it writes
 * `assessment_only`, which `personalSnapshotService` reads as revoked, so the
 * next Snapshot request is refused with `consent_required` while the
 * deterministic baseline the member already calculated stays intact. Nothing
 * here deletes data.
 */
export async function updateAccountConsent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Invalid consent choice", parsed.error.flatten().fieldErrors);
      return;
    }
    const profile = await OnboardingProfile.findOne({ where: { userId } });
    if (!profile?.isCompleted) {
      sendError(res, 404, "Finish your Snapshot before changing consent");
      return;
    }
    const wasPersonalized = profile.consentType === PERSONALIZATION_CONSENT_TYPE;
    await profile.update({
      consentType: parsed.data.allowsPersonalization
        ? PERSONALIZATION_CONSENT_TYPE
        : ASSESSMENT_ONLY_CONSENT_TYPE,
      consentVersion: parsed.data.consentVersion,
      consentTimestamp: new Date(),
    });
    libraryLog.info(
      `[${new Date().toISOString()}] consent set to ${
        parsed.data.allowsPersonalization ? "personalization" : "assessment only"
      } for ${userId}`,
    );
    if (wasPersonalized !== parsed.data.allowsPersonalization) {
      // A privacy decision, so it is recorded as important and cannot be
      // silenced by a routine category toggle.
      await notifyMember({
        userId,
        category: "account",
        important: true,
        title: "Privacy choice updated",
        body: parsed.data.allowsPersonalization
          ? "Personalization is on. Your logs may shape the guidance you see."
          : "Personalization is off. Your data is used for assessment only.",
        targetUrl: "/app/settings",
      });
    }
    sendSuccess(res, 200, "Consent choice saved", {
      allowsPersonalization: parsed.data.allowsPersonalization,
      type: profile.consentType,
      version: profile.consentVersion,
      recordedAt: (profile.consentTimestamp ?? new Date()).toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Drops notices the member has switched off.
 *
 * The rule itself lives in the notification policy so delivery and display
 * cannot drift apart; this stays as the controller-facing wrapper.
 */
export async function filterMemberNotifications<T extends { category: string }>(
  userId: string,
  notifications: T[],
): Promise<T[]> {
  return filterByPreferences(notifications, await loadPreferences(userId));
}
