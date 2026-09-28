import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import {
  runOutputGuardrails,
  runPreGenerationGuardrails,
} from "../../src/ai/guardrails/guardrailService.js";
import { buildContext } from "../../src/services/ai-gateway/contextAssembler.js";
import { GRANTED_CONSENT, makeContextSource } from "./fixtures.js";

/**
 * Guardrails are the last line of defence between a model and a member. These
 * tests pin the behaviours the spec requires: no diagnostic or prescriptive
 * language, no invented figures, and no output when the request itself is not
 * allowed to reach a model.
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

describe("pre-generation guardrails", () => {
  it("allows a request that has consent and approved evidence", () => {
    const verdict = runPreGenerationGuardrails(contextFor());

    assert.equal(verdict.allowed, true);
  });

  it("blocks when consent is missing", () => {
    const context = buildContext({
      feature: "personal_snapshot",
      userId: "11111111-1111-4111-8111-111111111111",
      role: "member",
      requestId: "test-request",
      source: makeContextSource(),
      consent: { ...GRANTED_CONSENT, status: "pending" },
      locale: "en-GB",
      promptVersion: "",
    });

    const verdict = runPreGenerationGuardrails(context);

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.findings.some((finding) => finding.severity === "block"));
  });

  it("blocks when no approved evidence was retrieved", () => {
    const context = contextFor();
    context.evidence = [];

    const verdict = runPreGenerationGuardrails(context);

    assert.equal(verdict.allowed, false);
    assert.ok(
      verdict.findings.some((finding) => finding.message.includes("No approved evidence"))
    );
  });
});

describe("output guardrails", () => {
  const context = contextFor();

  it("passes neutral wellness language", () => {
    const result = runOutputGuardrails(
      "Consider keeping a consistent wake time and noting how you feel each morning.",
      context
    );

    assert.equal(result.blocked, false);
    assert.equal(result.crisisDetected, false);
  });

  it("blocks diagnostic language", () => {
    const result = runOutputGuardrails(
      "You are likely suffering from clinical insomnia caused by hormone deficiency.",
      context
    );

    assert.equal(result.blocked, true);
    assert.ok(result.findings.some((finding) => finding.severity === "block"));
  });

  it("blocks prescriptive treatment language", () => {
    const result = runOutputGuardrails(
      "We recommend you start taking hormone replacement therapy at 2mg tonight.",
      context
    );

    assert.equal(result.blocked, true);
    assert.ok(result.findings.some((finding) => finding.check === "medical_risk_language"));
  });

  it("does not block ordinary wellness recommendations", () => {
    // Guards against the prescribed-regimen rule over-firing on non-clinical advice.
    const result = runOutputGuardrails(
      "We recommend you keep a consistent wake time and consider a short walk before bed.",
      context
    );

    assert.equal(result.blocked, false);
  });

  it("flags a numeric claim that is not in the deterministic context", () => {
    // Warn rather than block: the citation verifier strips the claim
    // deterministically, which is safer than discarding the whole response.
    const result = runOutputGuardrails(
      "Your sleep disturbance score is 94, which is far above the typical range.",
      context
    );

    assert.equal(result.blocked, false);
    assert.ok(result.findings.some((finding) => finding.check === "numeric_grounding"));
  });

  it("allows a numeric claim that exists in the deterministic context", () => {
    const result = runOutputGuardrails(
      "Your sleep disturbance score of 71 is one of the areas your responses highlighted.",
      context
    );

    assert.equal(result.blocked, false);
  });

  it("detects crisis content and flags it for crisis handling", () => {
    const result = runOutputGuardrails(
      "I understand you feel there is no reason to keep going and you do not want to be here.",
      context
    );

    // Crisis is tracked separately from `blocked` so the Gateway can respond with
    // a supportive crisis notice instead of a generic failure.
    assert.equal(result.crisisDetected, true);
  });
});
