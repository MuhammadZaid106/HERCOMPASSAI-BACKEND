/**
 * Run: pnpm exec tsx src/services/member/buildAccountView.test.ts
 */
import assert from "node:assert/strict";
import { buildAccountView } from "./buildAccountView.js";

const view = buildAccountView({
  name: "Amina",
  email: "amina@example.com",
  emailVerified: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  plan: "free",
  unreadCount: 2,
  profile: {
    isCompleted: true,
    consentType: "legacy_assessment",
    consentVersion: "privacy-2026-09-27",
    consentTimestamp: "2026-09-02T00:00:00.000Z",
    dailyCheckinOptIn: true,
    preferredRecommendations: ["Meal ideas"],
    partnerSupportInterest: "not_now",
    partnerConsent: false,
    partnerSharingScopes: [],
    partnerEmail: "partner@example.com",
  },
});

assert.equal(view.profile.planLabel, "Free");
assert.equal(view.consent?.allowsPersonalization, false);
assert.equal(view.partner?.emailOnFile, true);
assert.equal("partnerEmail" in (view.partner ?? {}), false);
assert.equal(view.notifications.unreadCount, 2);

const empty = buildAccountView({
  name: "Amina",
  email: "amina@example.com",
  emailVerified: false,
  createdAt: "2026-09-01T00:00:00.000Z",
  plan: "nope",
  unreadCount: 0,
  profile: null,
});
assert.equal(empty.profile.plan, "free");
assert.equal(empty.consent, null);
assert.equal(empty.partner, null);

console.log("[OK] account view checks passed");
