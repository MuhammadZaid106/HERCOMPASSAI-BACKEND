import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { partnerHomeAllowed, presentPartnerHome } from "../../src/services/partner/partnerHome.js";
import { buildPartnerInviteUrl } from "../../src/services/mail/partnerInviteEmail.js";

describe("partner home", () => {
  it("refuses a member", () => {
    assert.equal(partnerHomeAllowed("member"), false);
    assert.equal(partnerHomeAllowed("partner"), true);
  });

  it("hides the member when there is no accepted invite", () => {
    const home = presentPartnerHome({
      inviteStatus: null,
      sharingOn: true,
      scopes: ["general_support"],
      memberName: "Maria Alvarez",
      memberPlan: "plus",
    });
    assert.equal(home.connected, false);
    assert.equal("memberFirstName" in home, false);
  });

  it("returns the first name and only the scopes that are on", () => {
    const home = presentPartnerHome({
      inviteStatus: "accepted",
      sharingOn: true,
      scopes: ["general_support", "communication_guidance"],
      memberName: "Maria Alvarez",
      memberEmail: "maria@example.com",
      joinedAt: "2026-10-03T00:00:00.000Z",
      memberPlan: "free",
    });
    assert.equal(home.connected, true);
    if (!home.connected) return;
    assert.equal(home.memberFirstName, "Maria");
    assert.equal(home.generalSupport, true);
    assert.equal(home.sharedActivities, false);
    assert.equal(home.communicationGuidance, true);
    assert.equal(home.digestIncluded, false);
    assert.equal(home.planMessage, "Maria needs HerCompass Plus or Premium to open this.");
    assert.equal(home.memberEmail, "maria@example.com");
    assert.equal(home.joinedAt, "2026-10-03T00:00:00.000Z");
    const serialized = JSON.stringify(home);
    assert.equal(serialized.includes("symptom"), false);
    assert.equal(serialized.includes("score"), false);
    assert.equal(serialized.includes("note"), false);
  });

  it("clears the name when sharing is turned off", () => {
    const home = presentPartnerHome({
      inviteStatus: "accepted",
      sharingOn: false,
      scopes: ["general_support"],
      memberName: "Maria Alvarez",
      memberPlan: "plus",
    });
    assert.deepEqual(home, { connected: false, access: "off" });
  });

  it("clears the name when the invite was revoked", () => {
    const home = presentPartnerHome({
      inviteStatus: "revoked",
      sharingOn: true,
      scopes: ["general_support"],
      memberName: "Maria Alvarez",
      memberPlan: "premium",
    });
    assert.equal(home.connected, false);
    if (home.connected) return;
    assert.equal(home.access, "off");
    assert.equal("memberFirstName" in home, false);
  });

  it("builds an invitation link without health details", () => {
    const url = buildPartnerInviteUrl("http://localhost:3000", "abc123");
    assert.equal(url, "http://localhost:3000/partner/invite?token=abc123");
    assert.equal(url.includes("symptom"), false);
  });
});
