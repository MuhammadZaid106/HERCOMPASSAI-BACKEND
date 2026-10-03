import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { runGateway } from "../../src/services/ai-gateway/gateway.js";
import { runSci } from "../../src/services/ai-gateway/sciValidator.js";
import { runPreGenerationGuardrails } from "../../src/ai/guardrails/guardrailService.js";
import { clinicianReviewSummary } from "../../src/services/ai-gateway/evidenceService.js";
import { buildContext } from "../../src/services/ai-gateway/contextAssembler.js";
import { calculateConfidence } from "../../src/services/ai-gateway/confidenceService.js";
import { buildContextCitations, verifyAndRepair } from "../../src/services/ai-gateway/citationVerifier.js";
import { getProvider, overrideProviderForTests } from "../../src/ai/providers/index.js";
import { AI_GATEWAY_CONFIG } from "../../src/config/aiGateway.js";
import {
  GRANTED_CONSENT,
  SLEEP_CITATION_ID,
  StubProvider,
  makeContextSource,
  validSnapshotPayload,
} from "./fixtures.js";
import type { GatewayInvocation } from "../../src/services/ai-gateway/gateway.js";

/**
 * Crisis detection must not depend on the payload parsing.
 *
 * Guardrails ran after schema validation, so a disclosure of crisis content in a
 * response that also failed to encode correctly — truncated, wrapped in prose, or
 * an unterminated object — lost the crisis notice entirely. Schema validation
 * returned the deterministic fallback first and the guardrails never saw the
 * text, so a member in distress received a neutral list of their own verified
 * numbers while the disclosure went unread.
 *
 * These tests also pin that a refusal is reported as the authorization failure it
 * is, and that the SCI confidence and safety-notice checks can actually fail.
 */

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const CRISIS_TEXT = "You said you do not want to be here and there is no reason to keep going.";

function snapshotRequest(overrides: Partial<GatewayInvocation> = {}): GatewayInvocation {
  return {
    feature: "personal_snapshot",
    userId: MEMBER_ID,
    role: "member",
    consent: GRANTED_CONSENT,
    source: makeContextSource(),
    locale: "en-GB",
    ...overrides,
  };
}

async function runWithMed42Answering(content: string, fn: () => Promise<void>): Promise<void> {
  const original = getProvider("med42");
  assert.ok(original);
  overrideProviderForTests("med42", new StubProvider("med42", async () => content));
  try {
    await fn();
  } finally {
    overrideProviderForTests("med42", original);
  }
}

function isCrisisNotice(message: string): boolean {
  return /reach out|crisis helpline|trusted person|emergency services/i.test(message);
}

describe("crisis handling precedes schema validation", () => {
  it("gives the crisis notice when the disclosure is also malformed JSON", async () => {
    // Truncated after the opening brace: schema validation cannot recover this,
    // so before the reorder the request fell through to the fallback.
    await runWithMed42Answering(
      `{"symptomPattern": {"summary": "${CRISIS_TEXT}"`,
      async () => {
        const result = await runGateway(snapshotRequest());

        assert.equal(result.ok, false, "a crisis disclosure must never be served");
        if (result.ok) return;
        assert.ok(
          isCrisisNotice(result.message),
          `expected the crisis notice, got: ${result.message}`
        );
        assert.equal(result.provenance.resultStatus, "blocked");
      }
    );
  });

  it("gives the crisis notice when the payload is valid JSON but off-contract", async () => {
    await runWithMed42Answering(
      JSON.stringify({ symptomPattern: { summary: CRISIS_TEXT } }),
      async () => {
        const result = await runGateway(snapshotRequest());

        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.ok(isCrisisNotice(result.message), `got: ${result.message}`);
      }
    );
  });

  it("gives the crisis notice when the payload is fully valid", async () => {
    const payload = validSnapshotPayload(SLEEP_CITATION_ID);
    payload.symptomPattern.summary = CRISIS_TEXT;

    await runWithMed42Answering(JSON.stringify(payload), async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(isCrisisNotice(result.message), `got: ${result.message}`);
    });
  });

  it("records the withheld response as an unsafe-content block", async () => {
    await runWithMed42Answering(`{"summary": "${CRISIS_TEXT}"`, async () => {
      const result = await runGateway(snapshotRequest());

      assert.ok(
        result.provenance.sciFindings.some(
          (finding) => finding.check === "unsafe_content" && finding.severity === "block"
        ),
        "a withheld crisis response must leave an audit finding"
      );
    });
  });

  it("does not mistake ordinary fallback content for a crisis", async () => {
    await runWithMed42Answering("{ not json at all", async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true, "an unparseable but harmless response falls back");
      assert.equal(result.provenance.resultStatus, "fallback");
      assert.equal(result.provenance.degradation?.reason, "schema_invalid");
    });
  });
});

describe("pre-generation refusals are classified structurally", () => {
  function contextWith(overrides: { consentStatus?: "granted" | "revoked" | "pending"; evidence?: unknown[] }) {
    const context = buildContext({
      feature: "personal_snapshot",
      userId: MEMBER_ID,
      role: "member",
      requestId: "test-request",
      source: makeContextSource(),
      consent: { ...GRANTED_CONSENT, status: overrides.consentStatus ?? "granted" },
      locale: "en-GB",
      promptVersion: "",
    });
    if (overrides.evidence) context.evidence = overrides.evidence as typeof context.evidence;
    return context;
  }

  it("names the consent refusal rather than inferring it from message wording", () => {
    const verdict = runPreGenerationGuardrails(contextWith({ consentStatus: "revoked" }));

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, "consent_missing");
  });

  it("distinguishes a missing evidence catalog from a missing consent grant", () => {
    const verdict = runPreGenerationGuardrails(contextWith({ evidence: [] }));

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, "no_evidence");
  });

  it("prefers the consent reason when both are missing", () => {
    const verdict = runPreGenerationGuardrails(
      contextWith({ consentStatus: "revoked", evidence: [] })
    );

    assert.equal(verdict.reason, "consent_missing");
  });

  it("reports no reason for an allowed request", () => {
    const verdict = runPreGenerationGuardrails(contextWith({}));

    assert.equal(verdict.allowed, true);
    assert.equal(verdict.reason, null);
  });

  it("answers a missing consent grant with 403, not 422", async () => {
    const result = await runGateway(snapshotRequest({ consent: { ...GRANTED_CONSENT, status: "revoked" } }));

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.statusCode, 403);
    assert.match(result.message, /consent/i);
  });
});

describe("SCI confidence and safety-notice checks can actually fail", () => {
  function sciInput(overrides: Record<string, unknown> = {}) {
    const context = buildContext({
      feature: "personal_snapshot",
      userId: MEMBER_ID,
      role: "member",
      requestId: "test-request",
      source: makeContextSource(),
      consent: GRANTED_CONSENT,
      locale: "en-GB",
      promptVersion: "",
    });
    const citations = buildContextCitations(context);
    const verification = verifyAndRepair(
      validSnapshotPayload(context.evidence[0].record.citationId),
      context
    );
    const confidence = calculateConfidence({
      context,
      citations: verification.citations,
      cleanFinish: true,
      withinLatencyBudget: true,
      noWarnings: true,
    });

    return {
      feature: "personal_snapshot",
      context: { requestId: "test-request" },
      repaired: verification.repaired,
      guardrailFindings: [],
      verification,
      minCitations: 1,
      confidence,
      safetyNotice: AI_GATEWAY_CONFIG.safetyNotice,
      citations,
      ...overrides,
    };
  }

  it("blocks a response whose confidence was never computed", () => {
    const result = runSci(sciInput({ confidence: null }) as never);

    assert.equal(result.passed, false);
    assert.ok(
      result.findings.some(
        (finding) => finding.check === "confidence_present" && finding.severity === "block"
      )
    );
  });

  it("blocks a response whose confidence score is not a finite number", () => {
    const base = sciInput();
    const result = runSci(
      sciInput({ confidence: { ...base.confidence, confidenceScore: Number.NaN } }) as never
    );

    assert.equal(result.passed, false);
    assert.ok(result.findings.some((finding) => finding.check === "confidence_present"));
  });

  it("blocks a response carrying no safety notice", () => {
    const result = runSci(sciInput({ safetyNotice: "   " }) as never);

    assert.equal(result.passed, false);
    assert.ok(
      result.findings.some(
        (finding) => finding.check === "safety_language" && finding.severity === "block"
      )
    );
  });

  it("passes when both are genuinely present", () => {
    const result = runSci(sciInput() as never);

    assert.equal(result.passed, true);
    assert.ok(!result.findings.some((finding) => finding.check === "confidence_present"));
    assert.ok(!result.findings.some((finding) => finding.check === "safety_language"));
  });
});

describe("evidence governance is reported, not assumed", () => {
  it("does not describe the catalog as clinician-reviewed while records are unsigned", () => {
    const summary = clinicianReviewSummary();

    assert.ok(summary.citable > 0, "the catalog must not be empty");
    assert.equal(
      summary.fullyClinicianReviewed,
      summary.pendingClinicianReview === 0,
      "fullyClinicianReviewed must follow the pending count"
    );
    assert.equal(summary.pendingCitationIds.length, summary.pendingClinicianReview);
    assert.equal(summary.clinicianSigned + summary.pendingClinicianReview, summary.citable);
  });

  it("keeps every citable record retrievable while it awaits sign-off", () => {
    // The catalog is deliberately usable: refusing to cite anything would leave
    // the product unable to produce a grounded Snapshot at all. What must not
    // happen is the gap being invisible.
    const summary = clinicianReviewSummary();

    assert.equal(summary.total, summary.citable, "every seeded record should be citable");
  });
});