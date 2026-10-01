import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { extractJsonObject } from "../../src/ai/schemas/jsonPayload.js";
import {
  buildContextCitations,
  verifyAndRepair,
} from "../../src/services/ai-gateway/citationVerifier.js";
import { buildContext } from "../../src/services/ai-gateway/contextAssembler.js";
import { isCitableRecord } from "../../src/services/ai-gateway/evidenceService.js";
import { GRANTED_CONSENT, makeContextSource, validSnapshotPayload } from "./fixtures.js";

/**
 * Citation verification is the anti-hallucination control. The spec allows three
 * responses to an unsupported claim — remove, rewrite, or block. An unknown id
 * is removed. When that empties the recommendation list and evidence was
 * retrieved, software rewrites the list from those cards.
 */

function contextFor(overrides = {}) {
  return buildContext({
    feature: "personal_snapshot",
    userId: "11111111-1111-4111-8111-111111111111",
    role: "member",
    requestId: "test-request",
    source: makeContextSource(overrides),
    consent: GRANTED_CONSENT,
    locale: "en-GB",
    promptVersion: "",
  });
}

describe("buildContextCitations", () => {
  it("exposes only approved evidence, scored by retrieval relevance", () => {
    const citations = buildContextCitations(contextFor());

    assert.ok(citations.length > 0);
    assert.ok(citations.every((citation) => citation.verified));
    assert.ok(citations.every((citation) => citation.relevanceScore > 0));
  });
});

describe("verifyAndRepair", () => {
  it("keeps a recommendation whose citation resolves to approved evidence", () => {
    const context = contextFor();
    const citationId = context.evidence[0].record.citationId;
    const payload = validSnapshotPayload(citationId);

    const result = verifyAndRepair(payload, context);

    assert.equal(result.repaired.personalizedRecommendations.length, 1);
    assert.deepEqual(
      result.repaired.personalizedRecommendations[0].citationIds,
      [citationId]
    );
    assert.deepEqual(result.usedCitationIds, [citationId]);
    assert.equal(result.unsupportable, false);
  });

  it("does not cite a record that has no publication year", () => {
    const context = contextFor();
    const record = context.evidence[0]?.record;
    assert.ok(record);
    assert.equal(isCitableRecord({ ...record, publicationDate: "" }), false);
    assert.equal(isCitableRecord({ ...record, sourceName: "  " }), false);
  });

  it("keeps a citation id that differs only by case or surrounding spaces", () => {
    const context = contextFor();
    const citationId = context.evidence[0].record.citationId;
    const payload = validSnapshotPayload(`  ${citationId.toLowerCase()}  `);

    const result = verifyAndRepair(payload, context);

    assert.deepEqual(result.repaired.personalizedRecommendations[0].citationIds, [citationId]);
    assert.equal(result.unsupportable, false);
  });

  it("replaces recommendations that cite an unknown source with retrieved cards", () => {
    const context = contextFor();
    const allowed = new Set(context.evidence.map((item) => item.record.citationId));
    const payload = validSnapshotPayload("HC-CF-9999-DOES-NOT-EXIST");

    const result = verifyAndRepair(payload, context);

    assert.ok(result.repaired.personalizedRecommendations.length > 0);
    assert.ok(result.findings.some((finding) => finding.check === "citation_validity"));
    assert.ok(result.findings.some((finding) => finding.check === "evidence_support"));
    assert.equal(result.unsupportable, false);
    for (const recommendation of result.repaired.personalizedRecommendations) {
      assert.ok(recommendation.citationIds.every((id) => allowed.has(id)));
      assert.equal(recommendation.what.includes("HC-CF-9999"), false);
    }
  });

  it("stays unsupportable when no evidence was retrieved", () => {
    const context = { ...contextFor(), evidence: [] };
    const payload = validSnapshotPayload("NAMS-MENO-001");

    const result = verifyAndRepair(payload, context);

    assert.equal(result.repaired.personalizedRecommendations.length, 0);
    assert.equal(result.unsupportable, true);
  });

  it("replaces a recommendation that contains a figure absent from the context", () => {
    const context = contextFor();
    const citationId = context.evidence[0].record.citationId;
    const payload = validSnapshotPayload(citationId);
    payload.personalizedRecommendations[0].what =
      "Improve your sleep disturbance score from 94 to 30 within 3 weeks.";

    const result = verifyAndRepair(payload, context);

    assert.ok(result.repaired.personalizedRecommendations.length > 0);
    assert.ok(result.findings.some((finding) => finding.check === "numeric_grounding"));
    assert.ok(
      result.repaired.personalizedRecommendations.every(
        (recommendation) => !recommendation.what.includes("94")
      )
    );
  });

  it("drops the partner-support section when its citation is unknown", () => {
    const context = contextFor();
    const citationId = context.evidence[0].record.citationId;
    const payload = validSnapshotPayload(citationId);
    payload.partnerSupportOpportunity = {
      suggestedApproach: "Ask what would help most tonight.",
      shareIdea: "She may want to talk about sleep.",
      citationIds: ["HC-CF-9999-DOES-NOT-EXIST"],
    };

    const result = verifyAndRepair(payload, context);

    assert.equal(result.repaired.partnerSupportOpportunity, null);
    assert.equal(result.repaired.personalizedRecommendations.length, 1);
  });

  it("removes lifestyle observations containing ungrounded figures", () => {
    const context = contextFor();
    const citationId = context.evidence[0].record.citationId;
    const payload = validSnapshotPayload(citationId);
    payload.lifestyleObservations = [
      "You told us you wake several times during the night.",
      "Your resting heart rate is 82 bpm.",
    ];

    const result = verifyAndRepair(payload, context);

    assert.equal(result.repaired.lifestyleObservations.length, 1);
    assert.ok(result.findings.some((finding) => finding.check === "numeric_grounding"));
  });

  it("marks a partner digest with no valid citation as unsupportable", () => {
    const context = buildContext({
      feature: "partner_digest",
      userId: "22222222-2222-4222-8222-222222222222",
      role: "partner",
      requestId: "test-request",
      source: makeContextSource(),
      consent: GRANTED_CONSENT,
      locale: "en-GB",
      promptVersion: "",
      partnerScope: ["digest_summary"],
    });

    const result = verifyAndRepair(
      {
        whatSheMayBeExperiencing: "She may be finding sleep difficult.",
        whatMayHelp: ["A consistent wind-down routine."],
        howToCommunicate: ["Ask an open question."],
        whatToAvoid: ["Naming a condition."],
        oneSimpleSupportAction: "Ask her one open question today.",
        citationIds: ["HC-CF-9999-DOES-NOT-EXIST"],
      },
      context
    );

    assert.deepEqual(result.repaired.citationIds, []);
    assert.equal(result.unsupportable, true);
  });
});
  