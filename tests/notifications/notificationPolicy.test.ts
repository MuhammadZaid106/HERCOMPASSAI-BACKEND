import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import {
  CATEGORY_LABELS,
  NOTIFICATION_CATEGORIES,
  filterByPreferences,
  isNotificationCategory,
  isNotificationEnabled,
  preferenceKeyFor,
  type NotificationCategory,
  type NotificationPreferenceSet,
} from "../../src/services/notifications/notificationPolicy.js";

/**
 * Notification preference rules.
 *
 * Runs without a database: these assert which notices a member may receive,
 * which is the same decision the delivery service and the list endpoint both
 * ask for, so this file is where "what gets sent" is pinned down.
 */

function allPreferences(overrides: Partial<NotificationPreferenceSet> = {}): NotificationPreferenceSet {
  return {
    snapshot: true,
    trackingReminders: true,
    recommendations: true,
    partner: true,
    plans: true,
    account: true,
    privacySecurity: true,
    ...overrides,
  };
}

describe("preferenceKeyFor", () => {
  it("maps each category to its own toggle", () => {
    assert.equal(preferenceKeyFor("snapshot", false), "snapshot");
    assert.equal(preferenceKeyFor("tracking", false), "trackingReminders");
    assert.equal(preferenceKeyFor("recommendation", false), "recommendations");
    assert.equal(preferenceKeyFor("partner", false), "partner");
    assert.equal(preferenceKeyFor("plan", false), "plans");
    assert.equal(preferenceKeyFor("account", false), "account");
  });

  it("sends important notices to privacySecurity regardless of category", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      assert.equal(preferenceKeyFor(category, true), "privacySecurity");
    }
  });
});

describe("isNotificationEnabled", () => {
  it("allows everything when the member has no saved row", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      assert.equal(isNotificationEnabled(null, category, false), true);
      assert.equal(isNotificationEnabled(null, category, true), true);
    }
  });

  it("follows the category toggle for a routine notice", () => {
    const preferences = allPreferences({ partner: false });
    assert.equal(isNotificationEnabled(preferences, "partner", false), false);
    assert.equal(isNotificationEnabled(preferences, "snapshot", false), true);
  });

  it("ignores the category toggle for an important notice", () => {
    const preferences = allPreferences({ partner: false, privacySecurity: true });
    assert.equal(isNotificationEnabled(preferences, "partner", true), true);
  });

  it("suppresses an important notice when privacySecurity is off", () => {
    const preferences = allPreferences({ privacySecurity: false });
    assert.equal(isNotificationEnabled(preferences, "account", true), false);
  });
});

describe("filterByPreferences", () => {
  type Item = { category: string; important?: boolean | null };

  it("returns the list untouched without saved preferences", () => {
    const items: Item[] = [{ category: "partner" }, { category: "account", important: true }];
    assert.equal(filterByPreferences(items, null), items);
  });

  it("drops notices whose category is switched off", () => {
    const preferences = allPreferences({ partner: false });
    const items: Item[] = [
      { category: "partner" },
      { category: "snapshot" },
      { category: "tracking" },
    ];
    assert.deepEqual(filterByPreferences(items, preferences), [
      { category: "snapshot" },
      { category: "tracking" },
    ]);
  });

  it("keeps an important notice even when its category is off", () => {
    const preferences = allPreferences({ account: false, privacySecurity: true });
    const items: Item[] = [
      { category: "account", important: true },
      { category: "account", important: false },
    ];
    assert.deepEqual(filterByPreferences(items, preferences), [
      { category: "account", important: true },
    ]);
  });

  it("keeps categories it does not recognise", () => {
    const preferences = allPreferences({ partner: false });
    const items: Item[] = [{ category: "legacy-import" }];
    assert.deepEqual(filterByPreferences(items, preferences), items);
  });
});

describe("isNotificationCategory", () => {
  it("recognises every category and rejects anything else", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      assert.equal(isNotificationCategory(category), true);
    }
    assert.equal(isNotificationCategory("nope"), false);
    assert.equal(isNotificationCategory(""), false);
  });

  it("has a human label for every category", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      const label: string = CATEGORY_LABELS[category as NotificationCategory];
      assert.equal(typeof label, "string");
      assert.notEqual(label.length, 0);
    }
  });
});
