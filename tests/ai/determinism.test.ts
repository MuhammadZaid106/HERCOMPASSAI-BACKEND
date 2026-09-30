import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { extractJsonObject } from "../../src/ai/schemas/jsonPayload.js";
import { listApprovedEvidence, retrieveEvidence } from "../../src/services/ai-gateway/evidenceService.js";
import { resolveRoute, describeRouting } from "../../src/services/ai-gateway/modelRouter.js";
import { AI_GATEWAY_CONFIG, getRouteRule } from "../../src/config/aiGateway.js";
import { calculateConfidence } from "../../src/services/ai-gateway/confidenceService.js";
import { buildContext } from "../../src/services/ai-gateway/contextAssembler.js";
import { GRANTED_CONSENT, makeContextSource } from "./fixtures.js";

/**
 * Retrieval, JSON recovery, routing and confidence.
 *
 * These four units are the parts of the Gateway that must be fully deterministic,
 * so they are asserted directly rather than only through the end-to-end pipeline.
 */

describe("extractJsonObject", () => {
  it("reads a clean JSON object", () => {
    assert.deepEqual(extractJsonObject('{"a":1}', "provider"), { a: 1 });
  });

  it("reads a JSON object wrapped in a markdown code fence", () => {
    const content = 'Here is your result:\n```json\n{"ok":true}\n```\nHope this helps.';
    assert.deepEqual(extractJsonObject(content, "provider"), { ok: true });
  });

  it("recovers a response truncated after a valid closing brace", () => {
    const truncated = '{"summary":"Sleep is an area you highlighted.","items":[{"a":1},{"b":2}]}';
    assert.deepEqual(extractJsonObject(truncated, "provider"), {
      summary: "Sleep is an area you highlighted.",
      items: [{ a: 1 }, { b: 2 }],
    });
  });

  it("throws when no object can be recovered", () => {
    assert.throws(() => extractJsonObject("I am sorry, I cannot help with that.", "provider"));
  });
});

describe("evidence retrieval", () => {
  it("returns only approved records", () => {
    const records = listApprovedEvidence();

    assert.ok(records.length > 0);
    assert.ok(records.every((record) => record.status === "approved"));
  });

  it("excludes records that are not approved", () => {
    const result = retrieveEvidence({
      focusArea: "Sleep",
      goals: ["Improve sleep"],
      reportedAreas: ["Sleep difficulties"],
      topicHints: ["sleep"],
    });

    assert.ok(result.items.length > 0);
    assert.ok(result.items.every((item) => item.record.status === "approved"));
    assert.ok(result.items.every((item) => item.record.citationId.trim().length > 0));
  });

  it("ranks the most relevant record first and reports a version", () => {
    const result = retrieveEvidence({
      focusArea: "Restorative Sleep & Evening Wind-Down",
      goals: ["Improve sleep"],
      reportedAreas: ["Staying asleep"],
      topicHints: ["sleep", "wind_down"],
    });

    assert.ok(result.items.length > 0);
    assert.equal(result.items[0].record.status, "approved");
    assert.ok(result.evidenceVersion.includes(AI_GATEWAY_CONFIG.versions.evidence));
    assert.ok(
      result.items.every((item) => item.relevanceScore >= AI_GATEWAY_CONFIG.evidence.minRelevance),
      "every returned record must clear the configured relevance threshold"
    );
  });

  it("reports insufficient evidence when nothing clears the relevance threshold", () => {
    const result = retrieveEvidence({
      focusArea: "Quantum chromodynamics",
      goals: ["Understand asymptotic freedom"],
      reportedAreas: ["Parton distribution functions"],
      topicHints: ["lattice", "gauge_theory"],
    });

    assert.equal(result.items.length, 0);
    assert.equal(result.insufficientEvidence, true);
  });
});

describe("model routing", () => {
  it("builds an ordered, non-empty attempt plan", () => {
    const plan = resolveRoute("personal_snapshot", "structured_generation");

    assert.ok(plan.attempts.length > 0);
    // Order is zero-based: 0 is the primary engine.
    assert.equal(plan.attempts[0].order, 0);
    assert.equal(plan.attempts[0].isFallback, false);
    assert.ok(plan.temperature >= 0 && plan.temperature <= 1);
    assert.ok(plan.maxOutputTokens > 0);
  });

  it("attempts the configured primary engine first, then the fallback chain", () => {
    const rule = getRouteRule("personal_snapshot", "structured_generation");
    assert.ok(rule, "personal_snapshot must have a routing rule");

    const plan = resolveRoute("personal_snapshot", "structured_generation");
    const expected = [rule.primary, ...rule.fallbackChain].filter((provider) =>
      plan.attempts.some((attempt) => attempt.provider === provider)
    );

    assert.deepEqual(
      plan.attempts.map((attempt) => attempt.provider),
      expected
    );
    assert.equal(plan.attempts[0].provider, rule.primary);
  });

  it("gives every attempt a usable provider instance and the configured limits", () => {
    const rule = getRouteRule("personal_snapshot", "structured_generation");
    assert.ok(rule, "personal_snapshot must have a routing rule");

    const plan = resolveRoute("personal_snapshot", "structured_generation");

    for (const attempt of plan.attempts) {
      assert.ok(attempt.providerInstance, "each attempt must carry a provider instance");
      assert.equal(attempt.providerInstance.name, attempt.provider);
    }

    assert.equal(plan.temperature, rule.temperature);
    assert.equal(plan.maxOutputTokens, rule.maxOutputTokens);
    assert.equal(plan.minCitations, rule.minCitations);
  });

  it("reports routing for health output without leaking connection details", () => {
    const described = describeRouting();

    assert.ok(described.length > 0);
    for (const entry of described) {
      assert.ok(entry.primary);
      assert.ok(Array.isArray(entry.fallback));
      assert.ok(Array.isArray(entry.available));
      assert.equal(JSON.stringify(entry).includes("http"), false);
    }
  });
});

describe("deterministic confidence", () => {
  function contextFor() {
    return buildContext({
      feature: "personal_snapshot",
      userId: "11111111-1111-4111-8111-111111111111",
      role: "member",
      requestId: "test-request",
      source: makeContextSource(),
      consent: GRANTED_CONSENT,
      locale: "en-GB",
      promptVersion: "",
    });
  }

  it("returns a bounded score with an explicit class", () => {
    const confidence = calculateConfidence({
      context: contextFor(),
      citations: [],
      cleanFinish: true,
      withinLatencyBudget: true,
      noWarnings: true,
    });

    assert.ok(confidence.confidenceScore >= 0 && confidence.confidenceScore <= 1);
    assert.ok(["high", "moderate", "limited"].includes(confidence.confidenceClass));
    assert.equal(typeof confidence.confidenceClass, "string");
  });

  it("scores lower with no evidence than with strong evidence", () => {
    const context = contextFor();
    const citations = context.evidence.map((item) => ({
      citationId: item.record.citationId,
      evidenceId: item.record.evidenceId,
      sourceName: item.record.sourceName,
      sourceCategory: item.record.sourceCategory,
      title: item.record.title,
      publisher: item.record.publisher,
      publicationDate: item.record.publicationDate,
      urlOrIdentifier: item.record.urlOrIdentifier,
      authorityLevel: 5,
      consensusLevel: 5,
      recencyScore: 1,
      relevanceScore: 1,
      verified: true,
      clinicianReview: "pending",
    }));

    const withEvidence = calculateConfidence({
      context,
      citations,
      cleanFinish: true,
      withinLatencyBudget: true,
      noWarnings: true,
    });

    const withoutEvidence = calculateConfidence({
      context,
      citations: [],
      cleanFinish: true,
      withinLatencyBudget: true,
      noWarnings: true,
    });

    assert.ok(
      withEvidence.confidenceScore > withoutEvidence.confidenceScore,
      "evidence strength must raise the confidence score"
    );
    assert.ok(withEvidence.components.evidenceStrength > 0);
    assert.equal(withoutEvidence.components.evidenceStrength, 0);
  });

  it("penalises a degraded generation event", () => {
    const context = contextFor();

    const clean = calculateConfidence({
      context,
      citations: [],
      cleanFinish: true,
      withinLatencyBudget: true,
      noWarnings: true,
    });

    const degraded = calculateConfidence({
      context,
      citations: [],
      cleanFinish: false,
      withinLatencyBudget: false,
      noWarnings: false,
    });

    assert.ok(clean.confidenceScore > degraded.confidenceScore);
    assert.ok(degraded.components.modelEvaluation < clean.components.modelEvaluation);
  });
});
