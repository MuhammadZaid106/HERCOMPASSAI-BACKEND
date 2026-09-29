import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { buildContext, deterministicMetricsFor } from "../../src/services/ai-gateway/contextAssembler.js";
import { assemblePrompt } from "../../src/services/ai-gateway/promptService.js";
import { presentSnapshot, presentDeterministicMetrics } from "../../src/services/ai-gateway/snapshotPresenter.js";
import { collectPermittedNumbers } from "../../src/ai/guardrails/guardrailService.js";
import { getFeaturePolicy } from "../../src/config/aiGateway.js";
import { runGateway } from "../../src/services/ai-gateway/gateway.js";
import { getProvider, overrideProviderForTests } from "../../src/ai/providers/index.js";
import {
  GRANTED_CONSENT,
  SLEEP_CITATION_ID,
  StubProvider,
  makeContextSource,
  makeSparseTrends,
  makeTrends,
  validSnapshotPayload,
} from "./fixtures.js";
import type { GatewayInvocation } from "../../src/services/ai-gateway/gateway.js";
import type { PersonalSnapshotOutput } from "../../src/ai/types/index.js";

/**
 * Deterministic Trend Engine -> LLM binding.
 *
 * The architecture says the model interprets values that deterministic software
 * already calculated. Before this wiring existed, `buildContext` read only the
 * onboarding baseline, so every daily check-in a member logged was invisible to
 * the AI: the Snapshot could describe how they felt in a questionnaire but not
 * how their last month actually went. These tests pin the three properties that
 * make the fix real — the values arrive, the model may not recalculate them, and
 * they do not leak across the partner boundary.
 */

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

const CONSENT = {
  consentId: GRANTED_CONSENT.consentId,
  consentType: GRANTED_CONSENT.consentType,
  consentVersion: GRANTED_CONSENT.consentVersion,
  status: "granted" as const,
};

function memberContext(trends = makeTrends()) {
  return buildContext({
    feature: "personal_snapshot",
    userId: MEMBER_ID,
    role: "member",
    requestId: REQUEST_ID,
    source: makeContextSource({ trends }),
    consent: CONSENT,
    locale: "en-GB",
    promptVersion: "",
  });
}

describe("Trend Engine values reach the model", () => {
  it("projects the verified trend series onto the gateway context", () => {
    const context = memberContext();
    const trend = context.trend;

    assert.ok(trend, "the context must carry the Trend Engine output");
    assert.equal(trend.rangeDays, 30);
    assert.equal(trend.daysWithAnyEntry, 14);
    assert.equal(trend.consistencyScore, 47);
    assert.equal(trend.checkInStreak, 4);
    assert.equal(trend.symptomFrequency, 3.1);
    assert.equal(trend.symptoms.trend, "increasing");
    assert.equal(trend.mood.trend, "decreasing");
    assert.equal(trend.sleep.changePercent, -22);
    assert.deepEqual(trend.patternIndicators, makeTrends().patternIndicators);
  });

  it("merges trend values into the deterministic metric bag the prompt renders", () => {
    const metrics = memberContext().deterministic.metrics;

    assert.equal(metrics["trend.rangeDays"], 30);
    assert.equal(metrics["trend.daysWithAnyEntry"], 14);
    assert.equal(metrics["trend.consistencyScore"], 47);
    assert.equal(metrics["trend.checkInStreak"], 4);
    assert.equal(metrics["trend.symptomFrequency"], 3.1);
    assert.equal(metrics["trend.sleep.changePercent"], -22);
    assert.equal(metrics["trend.energy.recentAverage"], 2.9);
  });

  it("carries the original onboarding baseline alongside the trends", () => {
    const metrics = memberContext().deterministic.metrics;

    assert.equal(metrics.symptomBurdenScore, 62);
    assert.equal(metrics.sleepDisturbanceScore, 71);
    assert.equal(metrics.dominantFocusArea, "Restorative Sleep & Evening Wind-Down");
  });

  it("omits a trend figure that was never calculated rather than substituting zero", () => {
    const metrics = memberContext(makeSparseTrends()).deterministic.metrics;

    assert.equal(metrics["trend.symptomFrequency"], undefined);
    assert.equal(metrics["trend.daysWithAnyEntry"], 1);
    assert.ok(!("trend.sleep.changePercent" in metrics));
  });

  it("reconciles the baseline against the logs and reports the disagreement", () => {
    const context = memberContext();

    // Reported sleep disturbance is high and the logged sleep series fell.
    assert.ok(
      context.deterministic.consistentSignals.includes(
        "logged_symptom_frequency_rising_alongside_reported_sleep_disturbance"
      ),
      "rising logged symptoms and a high reported sleep score must agree"
    );
    assert.ok(
      context.deterministic.consistentSignals.includes(
        "logged_mood_declining_alongside_low_reported_emotional_balance"
      ),
      "falling logged mood and a low reported balance score must agree"
    );
  });
});

describe("Trend Engine grounding", () => {
  it("permits a trend figure the engine calculated to be stated", () => {
    const permitted = collectPermittedNumbers(memberContext());

    assert.ok(permitted.has("3.1"), "the logged symptom frequency must be stateable");
    assert.ok(permitted.has("-22"), "the logged sleep change must be stateable");
    assert.ok(permitted.has("14"), "the days logged must be stateable");
  });

  it("does not permit a figure the engine never produced", () => {
    const permitted = collectPermittedNumbers(memberContext());

    assert.ok(!permitted.has("73"), "an invented figure must stay ungrounded");
  });
});

describe("Trend Engine values in the assembled prompt", () => {
  function render(trends = makeTrends()): string {
    const policy = getFeaturePolicy("personal_snapshot");
    assert.ok(policy);
    return assemblePrompt(memberContext(trends), policy.promptKey, "v1").messages
      .map((message) => message.content)
      .join("\n\n");
  }

  it("includes the trend block in the snapshot prompt", () => {
    const prompt = render();

    assert.ok(prompt.includes("insufficient_data: false"));
    assert.ok(prompt.includes("days_logged: 14"));
    assert.ok(prompt.includes("symptoms_trend: increasing"));
    assert.ok(prompt.includes("mood_trend: decreasing"));
    assert.ok(prompt.includes("sleep_change_percent: -22"));
    assert.ok(prompt.includes("range_days: 30"));
  });

  it("tells the model not to recompute a trend", () => {
    const prompt = render();

    assert.match(prompt, /Never recompute an average, a change percentage or a direction/i);
  });

  it("tells the model to say the data is thin rather than invent a direction", () => {
    const prompt = render(makeSparseTrends());

    assert.ok(prompt.includes("insufficient_data: true"));
    assert.match(prompt, /not yet enough logged data to describe a change/i);
  });

  it("never leaves an unsubstituted template token in the prompt", () => {
    assert.ok(!/\{\{[A-Z0-9_]+\}\}/.test(render()), "an unresolved token would reach the model");
  });
});

describe("Trend Engine values never cross the partner boundary", () => {
  it("omits trend series from a partner digest context", () => {
    const context = buildContext({
      feature: "partner_digest",
      userId: MEMBER_ID,
      role: "partner",
      requestId: REQUEST_ID,
      source: makeContextSource({ trends: makeTrends(), partnerSupportInterest: "yes" }),
      consent: CONSENT,
      locale: "en-GB",
      promptVersion: "",
      partnerScope: ["digest_summary"],
    });

    assert.equal(context.trend, null, "a partner must not receive the member's daily series");
    const metrics = JSON.stringify(context.deterministic.metrics);
    assert.ok(!metrics.includes("trend."), "no trend figure may reach the partner prompt");
  });
});

describe("Snapshot presentation", () => {
  const provenance = {
    requestId: REQUEST_ID,
    feature: "personal_snapshot" as const,
    provider: "med42" as const,
    model: "stub-med42",
    modelVersion: "0.0.1",
    promptVersion: "v1",
    evidenceVersion: "evidence-1.0",
    sciVersion: "1.0",
    configVersion: "1.0",
    taskType: "structured_generation" as const,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    latencyMs: 12,
    resultStatus: "approved" as const,
    confidence: "moderate" as const,
    safetyStatus: "pass" as const,
    fallbackUsed: false,
    attemptCount: 1,
    citations: [SLEEP_CITATION_ID],
    sciFindings: [],
  };

  async function approvedOutput(): Promise<PersonalSnapshotOutput> {
    const original = getProvider("med42");
    assert.ok(original);
    overrideProviderForTests(
      "med42",
      new StubProvider("med42", async () => JSON.stringify(validSnapshotPayload(SLEEP_CITATION_ID)))
    );
    try {
      const result = await runGateway({
        feature: "personal_snapshot",
        userId: MEMBER_ID,
        role: "member",
        consent: CONSENT,
        source: makeContextSource(),
        locale: "en-GB",
      } satisfies GatewayInvocation);
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("expected an approved snapshot");
      return result.output as PersonalSnapshotOutput;
    } finally {
      overrideProviderForTests("med42", original);
    }
  }

  it("presents exactly eight numbered sections", async () => {
    const presented = presentSnapshot({
      output: await approvedOutput(),
      provenance,
      member: { name: "Test Member", plan: "free" },
      completedAt: "2026-01-01T00:00:00.000Z",
      profileVersion: "1.0",
      trend: makeTrends(),
    });

    assert.equal(presented.observations.length, 8);
    assert.deepEqual(
      presented.observations.map((entry) => entry.id),
      [1, 2, 3, 4, 5, 6, 7, 8]
    );
    assert.equal(presented.observations[0].pillar, "Symptom Pattern");
    assert.equal(presented.observations[7].pillar, "Partner Support Opportunity");
  });

  it("surfaces the verified trend on the pattern sections", async () => {
    const presented = presentSnapshot({
      output: await approvedOutput(),
      provenance,
      member: { name: "Test Member", plan: "free" },
      completedAt: null,
      profileVersion: "1.0",
      trend: makeTrends(),
    });

    assert.equal(presented.observations[0].trend?.direction, "increasing");
    assert.equal(presented.observations[1].trend?.direction, "decreasing");
    assert.equal(presented.observations[2].trend?.changePercent, -22);
    assert.equal(presented.observations[3].trend?.direction, "stable");
  });

  it("carries provenance and the Gateway safety notice", async () => {
    const output = await approvedOutput();
    const presented = presentSnapshot({
      output,
      provenance,
      member: { name: "Test Member", plan: "free" },
      completedAt: null,
      profileVersion: "1.0",
    });

    assert.equal(presented.generation.requestId, REQUEST_ID);
    assert.equal(presented.generation.resultStatus, "approved");
    assert.equal(presented.safetyNotice, output.safetyNotice);
    assert.equal(presented.confidence.confidenceClass, output.confidence.confidenceClass);
  });

  it("reads the deterministic cards from the same bag the Gateway assembled", () => {
    const source = makeContextSource({ trends: makeTrends() });
    const metrics = presentDeterministicMetrics(deterministicMetricsFor(source));

    assert.equal(metrics.symptomBurdenScore, 62);
    assert.equal(metrics.sleepDisturbanceScore, 71);
    assert.equal(metrics.vitalityIndex, 48);
    assert.equal(metrics.emotionalBalanceScore, 44);
    assert.equal(metrics.trendDaysLogged, 14);
    assert.equal(metrics.trendConsistencyScore, 47);
  });

  it("renders a missing score as null rather than a fabricated default", () => {
    const metrics = presentDeterministicMetrics({ symptomBurdenScore: 62 });

    assert.equal(metrics.symptomBurdenScore, 62);
    assert.equal(metrics.vitalityIndex, null);
    assert.equal(metrics.dominantFocusArea, null);
  });
});
