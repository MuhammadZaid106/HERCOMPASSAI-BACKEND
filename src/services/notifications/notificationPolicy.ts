/**
 * Which notification a member is allowed to receive.
 *
 * Kept free of Sequelize and Express so the rules can be tested directly. The
 * controller and the delivery service both ask these functions rather than
 * re-deriving the mapping, so "what gets sent" and "what gets shown" can never
 * disagree.
 */

export const NOTIFICATION_CATEGORIES = [
  "snapshot",
  "tracking",
  "recommendation",
  "partner",
  "plan",
  "account",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferenceSet = {
  snapshot: boolean;
  trackingReminders: boolean;
  recommendations: boolean;
  partner: boolean;
  plans: boolean;
  account: boolean;
  privacySecurity: boolean;
};

type PreferenceKey = keyof NotificationPreferenceSet;

const CATEGORY_PREF: Record<NotificationCategory, PreferenceKey> = {
  snapshot: "snapshot",
  tracking: "trackingReminders",
  recommendation: "recommendations",
  partner: "partner",
  plan: "plans",
  account: "account",
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  snapshot: "Snapshot",
  tracking: "Tracking",
  recommendation: "Recommendations",
  partner: "Partner",
  plan: "Plans",
  account: "Account",
};

/**
 * The preference that governs a notice.
 *
 * Important notices always resolve to `privacySecurity`; everything else uses
 * its category's own toggle.
 */
export function preferenceKeyFor(
  category: NotificationCategory,
  important: boolean,
): PreferenceKey {
  if (important) return "privacySecurity";
  return CATEGORY_PREF[category] ?? "account";
}

/**
 * Whether a notice passes the member's choices.
 *
 * A member with no saved row has never opted out of anything, so an absent
 * preference set allows everything. That matches the database defaults.
 */
export function isNotificationEnabled(
  preferences: NotificationPreferenceSet | null,
  category: NotificationCategory,
  important: boolean,
): boolean {
  if (!preferences) return true;
  return Boolean(preferences[preferenceKeyFor(category, important)]);
}

/**
 * Drops notices the member has switched off.
 *
 * Applied when reading the list as well as when writing, so turning a category
 * off hides its history instead of leaving old rows on screen.
 */
export function filterByPreferences<
  T extends { category: string; important?: boolean | null },
>(items: T[], preferences: NotificationPreferenceSet | null): T[] {
  if (!preferences) return items;
  return items.filter((item) => {
    if (!isNotificationCategory(item.category)) return true;
    return isNotificationEnabled(
      preferences,
      item.category,
      Boolean(item.important),
    );
  });
}

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}
