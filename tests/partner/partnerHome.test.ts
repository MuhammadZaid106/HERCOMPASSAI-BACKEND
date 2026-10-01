import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { partnerHomeAllowed, presentPartnerHome } from "../../src/services/partner/partnerHome.js";

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
      memberPlan: "free",
    });
    assert.equal(home.connected, true);
    if (!home.connected) return;
    assert.equal(home.memberFirstName, "Maria");
    assert.equal(home.generalSupport, true);
    assert.equal(home.sharedActivities, false);
    assert.equal(home.communicationGuidance, true);
    assert.equal(home.digestIncluded, false);
    const serialized = JSON.stringify(home);
    assert.equal(serialized.includes("email"), false);
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
});
