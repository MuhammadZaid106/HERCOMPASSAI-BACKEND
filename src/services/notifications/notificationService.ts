import { Notification } from "../../models/Notification.js";
import { NotificationPreference } from "../../models/NotificationPreference.js";
import { logger } from "../../utils/logger.js";
import {
  isNotificationEnabled,
  type NotificationCategory,
  type NotificationPreferenceSet,
} from "./notificationPolicy.js";

const notificationLog = logger.module("NOTIFICATIONS");

export type NotifyInput = {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /**
   * A privacy or security event. Governed by the `privacySecurity` preference
   * rather than the category toggle.
   */
  important?: boolean;
  /** Where the notice should take the member. */
  targetUrl?: string | null;
};

function preferenceSet(row: NotificationPreference): NotificationPreferenceSet {
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

/**
 * Loads the member's choices, treating a missing row as "everything allowed".
 *
 * `findOrCreate` would write a row as a side effect of merely reading, which is
 * wasteful on a hot path, so this stays a read.
 */
export async function loadPreferences(
  userId: string,
): Promise<NotificationPreferenceSet | null> {
  const row = await NotificationPreference.findOne({ where: { userId } });
  return row ? preferenceSet(row) : null;
}

/**
 * Sends one notice if the member's choices allow it.
 *
 * Delivery is best-effort by design: it runs inside the request that caused the
 * event, and a member losing a notice is never worth failing the action that
 * produced it. Every failure is logged and swallowed, and `null` means "not
 * sent" for either reason.
 */
export async function notifyMember(input: NotifyInput): Promise<Notification | null> {
  const important = Boolean(input.important);
  try {
    const preferences = await loadPreferences(input.userId);
    if (!isNotificationEnabled(preferences, input.category, important)) {
      return null;
    }
    return await Notification.create({
      userId: input.userId,
      category: input.category,
      title: input.title,
      body: input.body,
      important,
      targetUrl: input.targetUrl ?? null,
    });
  } catch (error) {
    notificationLog.error(
      `failed to deliver ${input.category} notice to ${input.userId}`,
      error,
    );
    return null;
  }
}

/**
 * Sends a privacy or security notice.
 *
 * Separate from `notifyMember` so call sites read as the event they describe
 * and cannot forget the `important` flag.
 */
export async function notifySecurityEvent(
  userId: string,
  input: Omit<NotifyInput, "userId" | "category" | "important">,
): Promise<Notification | null> {
  return notifyMember({ ...input, userId, category: "account", important: true });
}

/**
 * Marks one notice read for its owner.
 *
 * Scoped to `userId` in the WHERE clause rather than looked up and then checked,
 * so a guessed id belonging to someone else reports not-found instead of
 * leaking that it exists.
 *
 * Returns false when no such row belongs to this member.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [count] = await Notification.update(
    { readAt: new Date() },
    { where: { id: notificationId, userId, readAt: null } },
  );
  return count > 0;
}

/**
 * Marks every unread notice read for this member.
 *
 * Returns how many were changed so the UI can say "3 marked as read" instead of
 * claiming success when there was nothing to do.
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const [count] = await Notification.update(
    { readAt: new Date() },
    { where: { userId, readAt: null } },
  );
  return count;
}

/** Count shown on the bell. */
export async function countUnread(userId: string): Promise<number> {
  return Notification.count({ where: { userId, readAt: null } });
}
