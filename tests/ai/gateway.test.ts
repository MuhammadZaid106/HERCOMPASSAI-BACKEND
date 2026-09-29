import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { runGateway } from "../../src/services/ai-gateway/gateway.js";
import { ModelProviderError } from "../../src/ai/types/index.js";
import { getProvider, listProviderNames, overrideProviderForTests } from "../../src/ai/providers/index.js";
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

describe("runGateway: degradation diagnostics", () => {
  /**
   * A degraded result used to be indistinguishable from a working one at the
   * client. The member saw their verified numbers and the UI said nothing, so a
   * permanently broken engine looked like a feature that worked, and the log
   * said only "unavailable" for every possible cause. These tests pin the two
   * halves of the fix: a client-safe explanation, and a reason that does not
   * carry our infrastructure.
   */

  /** Runs with `med42` failing in a specific way, and inspects the result. */
  async function withFailingMed42(
    error: ModelProviderError,
    assert_: (result: Awaited<ReturnType<typeof runGateway>>) => void
  ): Promise<void> {
    const original = realMed42();
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () => {
        throw error;
      })
    );
    try {
      assert_(await runGateway(snapshotRequest()));
    } finally {
      overrideProviderForTests("med42", original);
    }
  }

  /**
   * Fails every engine in the route, so the retry advice reflects a temporary
   * outage rather than a chain that also contains an unconfigured engine. The
   * distinction is load-bearing: a member told to "try again shortly" when the
   * fallback does not exist is being sent to wait for something that will never
   * change.
   */
  async function withWholeChainFailing(
    error: () => ModelProviderError,
    assert_: (result: Awaited<ReturnType<typeof runGateway>>) => void
  ): Promise<void> {
    const originals = new Map(listProviderNames().map((name) => [name, getProvider(name)!]));
    for (const name of originals.keys()) {
      overrideProviderForTests(
        name,
        new StubProvider(name, async () => {
          throw error();
        })
      );
    }
    try {
      assert_(await runGateway(snapshotRequest()));
    } finally {
      for (const [name, original] of originals) overrideProviderForTests(name, original);
    }
  }

  it("tells the client the result degraded and offers a retry when one can help", async () => {
    await withWholeChainFailing(
      () => new ModelProviderError("rate_limited", "med42", "busy", { httpStatus: 429 }),
      (result) => {
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.ok(result.diagnostics, "a degraded result must explain itself");
        assert.equal(result.diagnostics.degraded, true);
        assert.equal(result.diagnostics.reason, "generation_failed");
        assert.equal(result.diagnostics.retryable, true);
        assert.match(result.diagnostics.message, /verified numbers/i);
        assert.match(result.diagnostics.message, /trying again/i);
      }
    );
  });

  it("withholds the retry invitation when part of the chain is unconfigured", async () => {
    const original = realMed42();
    // Only the primary is rate limited; the rest of the chain stays unconfigured,
    // so a retry cannot produce a different outcome.
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () => {
        throw new ModelProviderError("rate_limited", "med42", "busy", { httpStatus: 429 });
      })
    );
    try {
      const result = await runGateway(snapshotRequest());
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.diagnostics?.retryable, false);
      assert.doesNotMatch(
        result.diagnostics?.message ?? "",
        /trying again/i,
        "must not invite a retry that cannot succeed"
      );
    } finally {
      overrideProviderForTests("med42", original);
    }
  });

  it("does not advise a retry for a permanent rejection", async () => {
    await withFailingMed42(
      new ModelProviderError("rejected", "med42", "no such model", {
        httpStatus: 400,
        detail: "code=model_not_supported",
      }),
      (result) => {
        assert.equal(result.ok, true);
        if (!result.ok) return;
        // The same request will be refused identically forever. Promising "try
        // again shortly" would be a lie the member acts on.
        assert.equal(result.diagnostics?.retryable, false);
        assert.equal(result.diagnostics?.engines[0]?.kind, "rejected");
        assert.equal(result.diagnostics?.engines[0]?.httpStatus, 400);
      }
    );
  });

  it("keeps the provider's explanation out of the client payload", async () => {
    await withFailingMed42(
      new ModelProviderError("rejected", "med42", "no such model", {
        httpStatus: 400,
        detail: "code=model_not_supported for m42-health/Llama3-Med42-8B",
      }),
      (result) => {
        assert.equal(result.ok, true);
        if (!result.ok) return;

        const serialised = JSON.stringify(result.diagnostics);
        assert.ok(!serialised.includes("model_not_supported"), "raw provider text must not ship");
        assert.ok(!serialised.includes("m42-health"), "the model id must not ship");
        // The classification still ships, so a support conversation can start
        // from "the engine refused the request" rather than "it was slow".
        assert.match(serialised, /rejected/);
      }
    );
  });

  it("records the full redacted explanation in provenance for the audit trail", async () => {
    await withFailingMed42(
      new ModelProviderError("rejected", "med42", "no such model", {
        httpStatus: 400,
        detail: "code=model_not_supported",
      }),
      (result) => {
        assert.equal(result.ok, true);
        if (!result.ok) return;
        // Server-side provenance keeps the detail the client does not get, which
        // is what makes the failure diagnosable after the fact.
        assert.equal(result.provenance.degradation?.reason, "generation_failed");
        assert.equal(result.provenance.degradation?.engines[0]?.httpStatus, 400);
        assert.match(result.provenance.degradation?.engines[0]?.detail ?? "", /model_not_supported/);
      }
    );
  });

  it("carries no diagnostics at all on a clean approved result", async () => {
    await runWithMed42Answering(JSON.stringify(validSnapshotPayload(SLEEP_CITATION_ID)), async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;
      // Failure vocabulary on a healthy response would be noise, and would make
      // a client that checks `diagnostics` for "AI is working" unreliable.
      assert.equal(result.diagnostics, undefined);
      assert.equal(result.provenance.degradation, null);
    });
  });

  it("names the cause when the engine's output fails schema validation", async () => {
    await runWithMed42Answering("I'm afraid I cannot help with that request.", async () => {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.diagnostics?.reason, "schema_invalid");
      // No engine failed, so retrying the same engine could work.
      assert.equal(result.diagnostics?.retryable, true);
    });
  });

  it("names the cause when guardrails block the generated text", async () => {
    await runWithMed42Answering(
      stubSnapshotPayload(
        "You are suffering from clinical insomnia and should take 2mg of hormone therapy nightly."
      ),
      async () => {
        const result = await runGateway(snapshotRequest());

        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.diagnostics?.reason, "guardrail_blocked");
        assert.match(result.diagnostics?.message ?? "", /safety checks/i);
      }
    );
  });

  it("does not attempt the same deployment and model twice", async () => {
    // `med42` and `llama` are both pointed at one hosted model in the current
    // configuration. Retrying the identical endpoint after a timeout cannot
    // succeed where the first attempt did not — it only doubles how long a member
    // waits before the deterministic fallback answers.
    const originals = new Map(listProviderNames().map((name) => [name, getProvider(name)!]));
    const identity = { model: "shared/model", deployment: "shared-host" };
    for (const name of originals.keys()) {
      overrideProviderForTests(
        name,
        new StubProvider(
          name,
          async () => {
            throw new ModelProviderError("timeout", name, "no response", { httpStatus: null });
          },
          identity
        )
      );
    }

    try {
      const result = await runGateway(snapshotRequest());

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(
        result.provenance.attemptCount,
        1,
        "an identical endpoint must be tried once, not once per registration"
      );
      assert.equal(result.provenance.degradation?.engines.length, 1);
    } finally {
      for (const [name, original] of originals) overrideProviderForTests(name, original);
    }
  });

  it("still attempts a genuinely different engine after a shared one fails", async () => {
    // The dedupe must not collapse a real fallback: a second engine on another
    // deployment is exactly the redundancy the chain exists for.
    const originals = new Map(listProviderNames().map((name) => [name, getProvider(name)!]));
    overrideProviderForTests(
      "med42",
      new StubProvider(
        "med42",
        async () => {
          throw new ModelProviderError("unavailable", "med42", "down");
        },
        { model: "model-a", deployment: "host-a" }
      )
    );
    overrideProviderForTests(
      "llama",
      new StubProvider(
        "llama",
        async () => {
          throw new ModelProviderError("unavailable", "llama", "down");
        },
        { model: "model-b", deployment: "host-b" }
      )
    );

    try {
      const result = await runGateway(snapshotRequest());
      assert.equal(result.ok, true);
      if (!result.ok) return;
      // The claim is that distinct engines are still each given a chance, not how
      // many entries the configured chain happens to have.
      const attempted = result.provenance.degradation?.engines.map((failure) => failure.provider) ?? [];
      assert.ok(attempted.includes("med42"), "the primary must be attempted");
      assert.ok(
        attempted.includes("llama"),
        `a different deployment must still be tried, got: ${attempted.join(", ")}`
      );
    } finally {
      for (const [name, original] of originals) overrideProviderForTests(name, original);
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
