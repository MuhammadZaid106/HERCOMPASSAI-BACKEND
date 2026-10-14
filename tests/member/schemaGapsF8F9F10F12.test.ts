import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import {
  Consent,
  Goal,
  PartnerRelationship,
  PartnerConsent,
  PartnerPermission,
  HumanReview,
} from "../../src/models/index.js";
import {
  recordConsent,
  getLatestConsent,
  listConsentHistory,
} from "../../src/services/member/consentService.js";
import {
  syncGoalsFromOnboarding,
  listUserGoals,
  createGoal,
  updateGoalStatus,
} from "../../src/services/member/goalService.js";
import {
  recordPartnerInvite,
  recordPartnerAcceptance,
  recordPartnerRevocation,
  getActiveRelationshipForPartner,
} from "../../src/services/partner/partnerRelationshipService.js";
import {
  resolveFlag,
  retestFlag,
  listHumanReviews,
} from "../../src/services/ai-gateway/feedbackService.js";

describe("Schema gaps F8, F9, F10, F12 unit tests", () => {
  it("verifies models are properly exported and have correct table names", () => {
    assert.equal(Consent.tableName, "consents");
    assert.equal(Goal.tableName, "goals");
    assert.equal(PartnerRelationship.tableName, "partner_relationships");
    assert.equal(PartnerConsent.tableName, "partner_consents");
    assert.equal(PartnerPermission.tableName, "partner_permissions");
    assert.equal(HumanReview.tableName, "human_reviews");
  });

  it("verifies consent service interfaces", () => {
    assert.equal(typeof recordConsent, "function");
    assert.equal(typeof getLatestConsent, "function");
    assert.equal(typeof listConsentHistory, "function");
  });

  it("verifies goal service interfaces", () => {
    assert.equal(typeof syncGoalsFromOnboarding, "function");
    assert.equal(typeof listUserGoals, "function");
    assert.equal(typeof createGoal, "function");
    assert.equal(typeof updateGoalStatus, "function");
  });

  it("verifies partner relationship service interfaces", () => {
    assert.equal(typeof recordPartnerInvite, "function");
    assert.equal(typeof recordPartnerAcceptance, "function");
    assert.equal(typeof recordPartnerRevocation, "function");
    assert.equal(typeof getActiveRelationshipForPartner, "function");
  });

  it("verifies human review interfaces on AI feedback", () => {
    assert.equal(typeof resolveFlag, "function");
    assert.equal(typeof retestFlag, "function");
    assert.equal(typeof listHumanReviews, "function");
  });
});
