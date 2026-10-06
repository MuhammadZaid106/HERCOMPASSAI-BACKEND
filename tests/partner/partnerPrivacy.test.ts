import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { assessPartnerRequest, decidePartnerGate } from "../../src/services/partner/partnerAccess.js";
import {
  applyTopicFilter,
  buildPartnerContext,
  buildPartnerGatewayRequest,
  composeDigest,
  contextHasHiddenFields,
  conversationGuide,
  partnerModelPayload,
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

  it("refuses another member and a topic that is off, with no name and no guide", () => {
    const otherMember = assessPartnerRequest({
      role: "partner",
      requestedMemberUserId: "member-2",
      connectedMemberUserId: "member-1",
      topic: "general_support",
      topicsAllowed: ["general_support"],
      memberFirstName: "Amina",
    });
    assert.equal(otherMember.result, "refused");
    assert.equal(otherMember.memberFirstName, null);
    assert.equal(otherMember.guide, null);
    assert.equal(JSON.stringify(otherMember).includes("Amina"), false);

    const topicOff = assessPartnerRequest({
      role: "partner",
      requestedMemberUserId: "member-1",
      connectedMemberUserId: "member-1",
      topic: "communication_guidance",
      topicsAllowed: ["general_support"],
      memberFirstName: "Amina",
    });
    assert.equal(topicOff.result, "refused");
    assert.equal(topicOff.guide, null);
    assert.equal(JSON.stringify(topicOff).includes("Amina"), false);
  });

  it("keeps hidden logs out of the object sent toward the model", () => {
    const dirty = {
      memberFirstName: "Amina",
      authorizedScope: ["general_support"] as const,
      evidenceIds: ["ev-nams-001"],
      symptoms: ["hot flash"],
      logs: [{ note: "private check-in" }],
      scores: { symptomBurdenScore: 80 },
      notes: "secret note",
      moodEntries: [{ mood: "low" }],
      sleepEntries: [{ hours: 4 }],
      otherMemberId: "member-2",
    };
    const payload = partnerModelPayload(dirty);
    assert.equal(contextHasHiddenFields(payload), false);
    assert.equal("otherMemberId" in payload, false);
    const request = buildPartnerGatewayRequest({
      context: payload,
      partnerUserId: "partner-1",
      partnerTask: "Write the weekly partner digest.",
      premium: false,
    });
    assert.deepEqual(request.logSignals, {});
    assert.equal(request.source.trends, null);
    assert.equal(contextHasHiddenFields(request.authorizedSignals), false);
    const handedOver = JSON.stringify({
      payload,
      authorizedSignals: request.authorizedSignals,
      partnerScope: request.partnerScope,
      pinnedEvidenceIds: request.pinnedEvidenceIds,
      logSignals: request.logSignals,
    });
    assert.equal(handedOver.includes("hot flash"), false);
    assert.equal(handedOver.includes("member-2"), false);
    assert.equal(handedOver.includes("secret note"), false);
    const filtered = applyTopicFilter(
      {
        ...composeDigest(payload),
        advancedObservation: "A closer look.",
      },
      ["general_support"],
      false,
    );
    assert.equal(filtered.howToCommunicate.length, 0);
    assert.equal(filtered.advancedObservation, null);
  });
});
