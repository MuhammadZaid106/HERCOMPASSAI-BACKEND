import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { runGateway } from "../../src/services/ai-gateway/gateway.js";
import { ModelProviderError } from "../../src/ai/types/index.js";
import { getProvider, overrideProviderForTests } from "../../src/ai/providers/index.js";
import {
  GRANTED_CONSENT,
  SLEEP_CITATION_ID,
  StubProvider,
  makeContextSource,
  stubSnapshotPayload,
  validSnapshotPayload,
} from "./fixtures.js";
import type { GatewayInvocation } from "../../src/services/ai-gateway/gateway.js";

/**
 * End-to-end Gateway tests.
 *
 * In the test environment the three real engines are unconfigured, so they are
 * registered but fail on the wire. The tests therefore replace the primary
 * engine for `personal_snapshot` (`med42`) with the StubProvider: the happy path
 * then proves the whole chain â€” authorization, consent, context assembly,
 * retrieval, routing, prompt assembly, generation, schema validation, guardrails,
 * citation verification, confidence, SCI, and audit â€” while the failure paths
 * prove the deterministic fallback.
 */

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";

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

/** The real registered med42 engine, restored after a test replaces it. */
function realMed42() {
  const engine = getProvider("med42");
  assert.ok(engine, "the med42 engine must be registered for tests");
  return engine;
}

/** Runs `fn` with `med42` stubbed to answer with `content`. */
async function runWithMed42Answering(content: string, fn: () => Promise<void>): Promise<void> {
  const original = realMed42();
  overrideProviderForTests(
    "med42",
    new StubProvider("med42", async () => content)
  );
  try {
    await fn();
  } finally {
    overrideProviderForTests("med42", original);
  }
}

describe("runGateway: approved path", () => {
  it("returns an approved snapshot with complete provenance", async () => {
    await runWithMed42Answering(JSON.stringify(validSnapshotPayload(SLEEP_CITATION_ID)), async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;

      const provenance = result.provenance;
      assert.equal(provenance.feature, "personal_snapshot");
      assert.ok(provenance.requestId.length > 0);
      assert.equal(provenance.provider, "med42");
      assert.equal(provenance.model, "stub-med42");
      assert.equal(provenance.modelVersion, "0.0.1");
      assert.notEqual(provenance.promptVersion, "unset");
      assert.ok(provenance.promptVersion);
      assert.ok(provenance.evidenceVersion.includes("1.0"));
      assert.ok(provenance.sciVersion);
      assert.ok(provenance.configVersion);
      assert.equal(provenance.taskType, "structured_generation");
      assert.ok(provenance.latencyMs >= 0);
      assert.ok(
        ["approved", "pass_with_warnings"].includes(provenance.safetyStatus),
        `unexpected safety status: ${provenance.safetyStatus}`
      );
      assert.ok(["approved", "approved_with_repairs"].includes(provenance.resultStatus));
      assert.ok(provenance.confidence);
    });
  });

  it("attaches deterministic confidence and a safety notice to the output", async () => {
    await runWithMed42Answering(JSON.stringify(validSnapshotPayload(SLEEP_CITATION_ID)), async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok || !("confidence" in result.output)) return;

      const output = result.output;
      assert.ok(output.confidence.confidenceScore >= 0);
      assert.ok(output.confidence.confidenceScore <= 1);
      assert.ok(output.confidence.components.evidenceStrength > 0);
      assert.ok(output.safetyNotice.length > 0);
      assert.equal(output.safetyStatus, "approved");
    });
  });

  it("grounds every recommendation in an approved citation", async () => {
    await runWithMed42Answering(JSON.stringify(validSnapshotPayload(SLEEP_CITATION_ID)), async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok || !("personalizedRecommendations" in result.output)) return;

      const approved = new Set(result.output.evidence.map((citation) => citation.citationId));
      assert.ok(approved.size > 0, "evidence must be attached to the response");

      for (const recommendation of result.output.personalizedRecommendations) {
        assert.ok(recommendation.citationIds.length > 0);
        for (const id of recommendation.citationIds) {
          assert.ok(approved.has(id), `citation ${id} is not in the approved evidence set`);
        }
      }
    });
  });
});

describe("runGateway: deterministic fallback", () => {
  it("serves the fallback when every engine fails at the transport layer", async () => {
    const original = realMed42();
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () => {
        throw new ModelProviderError("unavailable", "med42", "engine offline");
      })
    );

    try {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true, "a transport failure must not surface as an error");
      if (!result.ok) return;

      assert.equal(result.provenance.fallbackUsed, true);
      assert.equal(result.provenance.resultStatus, "fallback");
      assert.ok(result.provenance.attemptCount > 0);
      if ("personalizedRecommendations" in result.output) {
        assert.ok(result.output.personalizedRecommendations.length > 0);
        assert.ok(result.output.evidence.length > 0);
      }
    } finally {
      overrideProviderForTests("med42", original);
    }
  });

  it("serves the fallback when the engine returns malformed JSON", async () => {
    const original = realMed42();
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () => "I'm afraid I cannot help with that request.")
    );

    try {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.provenance.fallbackUsed, true);
      assert.ok(
        result.provenance.sciFindings.some((finding) => finding.check === "response_schema")
      );
    } finally {
      overrideProviderForTests("med42", original);
    }
  });

  it("serves the fallback when the engine emits unsafe clinical language", async () => {
    const original = realMed42();
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () =>
        stubSnapshotPayload(
          "You are suffering from clinical insomnia and should take 2mg of hormone therapy nightly."
        )
      )
    );

    try {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.provenance.fallbackUsed, true);
      assert.equal(result.provenance.safetyStatus, "blocked");
    } finally {
      overrideProviderForTests("med42", original);
    }
  });

  it("withholds the response and returns a support notice on crisis content", async () => {
    const original = realMed42();
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () =>
        stubSnapshotPayload(
          "It sounds like you do not want to be here and there is no reason to keep going."
        )
      )
    );

    try {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.statusCode, 422);
      assert.ok(
        /support|crisis|helpline|trust/i.test(result.message),
        `expected a supportive crisis notice, received: ${result.message}`
      );
      assert.equal(result.provenance.safetyStatus, "blocked");
    } finally {
      overrideProviderForTests("med42", original);
    }
  });
});

describe("runGateway: authorization and validation", () => {
  it("refuses a partner account requesting a member snapshot", async () => {
    const result = await runGateway(snapshotRequest({ role: "partner" }));

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.statusCode, 403);
  });

  it("refuses a partner digest with no authorized sharing scope", async () => {
    const result = await runGateway(
      snapshotRequest({ feature: "partner_digest", role: "partner" })
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    // The partner role is allowed the feature, but without an authorized scope
    // there is nothing to serve, so this is an authorization failure.
    assert.equal(result.statusCode, 403);
  });

  it("refuses an unsupported locale", async () => {
    const result = await runGateway(snapshotRequest({ locale: "fr-FR" }));

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.statusCode, 400);
  });

  it("refuses a request with no approved evidence to ground it", async () => {
    const result = await runGateway(
      snapshotRequest({
        source: makeContextSource({
          deterministicScores: { dominantFocusArea: "Unmapped Area", focusScore: 10 },
          primaryHealthConcerns: [],
          primaryGoals: [],
          primaryGoal: null,
          menopausePhase: null,
          sleepChallenges: [],
          moodPatterns: [],
          lifestyleFocus: [],
        }),
      })
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.provenance.resultStatus, "blocked");
    assert.ok(result.provenance.sciFindings.length > 0);
  });
});
