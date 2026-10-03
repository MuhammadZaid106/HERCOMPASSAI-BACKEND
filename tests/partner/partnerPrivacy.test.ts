import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { decidePartnerGate } from "../../src/services/partner/partnerAccess.js";
import {
  buildPartnerContext,
  composeDigest,
  contextHasHiddenFields,
  conversationGuide,
  supportGuide,
} from "../../src/services/partner/partnerContext.js";

const base = {
  role: "partner" as const,
  inviteStatus: "accepted" as const,
  sharingOn: true,
  scopes: ["general_support"],
  memberName: "Amina Rahman",
  memberPlan: "plus",
  memberUserId: "member-1",
};

describe("partner privacy", () => {
  it("hides the member when there is no accepted invite", () => {
    const gate = decidePartnerGate({ ...base, inviteStatus: null, sharingOn: false });
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.memberUserId, null);
    assert.equal(JSON.stringify(gate).includes("Amina"), false);
  });

  it("keeps only the topic that is on", () => {
    const gate = decidePartnerGate(base);
    assert.equal(gate.ok, true);
    if (!gate.ok) return;
    const context = buildPartnerContext({
      memberFirstName: gate.memberFirstName,
      authorizedScope: gate.topicsAllowed,
      evidenceIds: [],
    });
    assert.deepEqual(context.authorizedScope, ["general_support"]);
    assert.equal(supportGuide(context)?.lines.length, 3);
    assert.equal(conversationGuide(context), null);
    const digest = composeDigest(context);
    assert.equal(digest.howToCommunicate.length, 0);
    assert.ok(digest.whatMayHelp.length > 0);
  });

  it("stops access when sharing is off", () => {
    const gate = decidePartnerGate({ ...base, sharingOn: false, scopes: [] });
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.result, "empty");
    assert.equal(gate.memberUserId, null);
  });

  it("refuses a member token and a topic that is off", () => {
    const member = decidePartnerGate({ ...base, role: "member" });
    assert.equal(member.ok, false);
    if (!member.ok) assert.equal(member.result, "refused");
    const gate = decidePartnerGate(base);
    assert.equal(gate.ok, true);
    if (!gate.ok) return;
    assert.equal(gate.topicsAllowed.includes("communication_guidance"), false);
  });

  it("never places hidden logs into the partner context", () => {
    const context = buildPartnerContext({
      memberFirstName: "Amina",
      authorizedScope: ["general_support", "communication_guidance", "shared_activities"],
      evidenceIds: ["ev-nams-001"],
    });
    assert.equal(contextHasHiddenFields(context), false);
    assert.equal(contextHasHiddenFields(composeDigest(context)), false);
    const serialized = JSON.stringify({ context, digest: composeDigest(context) });
    assert.equal(serialized.includes("hot flash"), false);
    assert.equal(serialized.includes("symptom"), false);
  });
});
