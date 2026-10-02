import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { runGateway } from "../../src/services/ai-gateway/gateway.js";
import { verifyAndRepair } from "../../src/services/ai-gateway/citationVerifier.js";
import { buildContext } from "../../src/services/ai-gateway/contextAssembler.js";
import { getProvider, overrideProviderForTests } from "../../src/ai/providers/index.js";
import {
  GRANTED_CONSENT,
  SLEEP_CITATION_ID,
  StubProvider,
  makeContextSource,
  validSnapshotPayload,
} from "./fixtures.js";
import type { GatewayInvocation } from "../../src/services/ai-gateway/gateway.js";
import type { PersonalSnapshotOutput } from "../../src/ai/types/index.js";

/**
 * Numeric grounding across every model-authored field.
 *
 * The verifier stripped untraceable figures from recommendations, partner
 * support and lifestyle observations, but not from the four pattern summaries or
 * the next steps. Those five fields are sections 1-4 and 6 of the eight-part
 * Snapshot — the ones a member reads first — so a model could state "your energy
 * improved 87%" and it would ship verbatim, while the guardrail that detected it
 * only warned, justified in its own test by the claim that "the citation
 * verifier strips the claim deterministically". On these fields it did not.
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

function contextFor() {
  return buildContext({
    feature: "personal_snapshot",
    userId: MEMBER_ID,
    role: "member",
    requestId: "test-request",
    source: makeContextSource(),
    consent: GRANTED_CONSENT,
    locale: "en-GB",
    promptVersion: "",
  });
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

const UNGROUNDED = "87";

describe("pattern summaries are grounded, not only recommendations", () => {
  it("replaces a pattern summary that states a figure absent from the context", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.symptomPattern.summary = "Your symptom load has risen 87% since your last check-in.";

    const result = verifyAndRepair(payload, context);
    const repaired = result.repaired as PersonalSnapshotOutput;

    assert.ok(
      !repaired.symptomPattern.summary.includes(UNGROUNDED),
      `ungrounded figure survived: ${repaired.symptomPattern.summary}`
    );
    assert.ok(
      result.findings.some(
        (finding) => finding.check === "numeric_grounding" && finding.path === "symptomPattern.summary"
      ),
      "the replacement must be recorded as a finding"
    );
  });

  it("leaves the other three pattern sections untouched", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.symptomPattern.summary = "Your symptom load has risen 87% since your last check-in.";

    const repaired = verifyAndRepair(payload, context).repaired as PersonalSnapshotOutput;

    assert.equal(repaired.moodPattern.summary, payload.moodPattern.summary);
    assert.equal(repaired.sleepPattern.summary, payload.sleepPattern.summary);
    assert.equal(repaired.energyPattern.summary, payload.energyPattern.summary);
  });

  it("keeps a pattern summary whose figures are all in the deterministic context", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    // 62 is symptomBurdenScore and 71 is sleepDisturbanceScore — both supplied.
    payload.energyPattern.summary = "Your energy index of 48 sits beside a symptom burden of 62.";

    const repaired = verifyAndRepair(payload, context).repaired as PersonalSnapshotOutput;

    assert.equal(repaired.energyPattern.summary, payload.energyPattern.summary);
  });

  it("replaces the section with the approved deterministic wording for the same score", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.sleepPattern.summary = "Sleep disturbance scored 87 last night.";

    const repaired = verifyAndRepair(payload, context).repaired as PersonalSnapshotOutput;

    assert.match(repaired.sleepPattern.summary, /Based on what you shared/);
    assert.match(repaired.sleepPattern.summary, /not a diagnosis/);
    assert.ok(!repaired.sleepPattern.summary.includes(UNGROUNDED));
  });

  it("grounds every model-authored field of a pattern block, not just the summary", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.moodPattern.reportedAreas = ["Mood dips lasting 87 minutes"];

    const repaired = verifyAndRepair(payload, context).repaired as PersonalSnapshotOutput;

    assert.ok(!repaired.moodPattern.reportedAreas.join(" ").includes(UNGROUNDED));
  });

  it("removes a next step carrying an ungrounded figure", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.suggestedNextSteps = [
      { horizon: "today", action: "Log your mood." },
      { horizon: "this_week", action: "Reduce your load by 87% before Friday." },
    ];

    const result = verifyAndRepair(payload, context);
    const repaired = result.repaired as PersonalSnapshotOutput;

    assert.equal(repaired.suggestedNextSteps.length, 1);
    assert.equal(repaired.suggestedNextSteps[0].action, "Log your mood.");
    assert.ok(
      result.findings.some(
        (finding) => finding.check === "numeric_grounding" && finding.path === "suggestedNextSteps"
      )
    );
  });

  it("does not treat a repaired pattern section as making the response unsupportable", () => {
    const context = contextFor();
    const payload = validSnapshotPayload(context.evidence[0].record.citationId);
    payload.energyPattern.summary = "Energy improved 87%.";

    const result = verifyAndRepair(payload, context);

    // The deterministic context can always describe these four sections, so
    // repairing one must not discard an otherwise well-evidenced response.
    assert.equal(result.unsupportable, false);
  });
});

describe("no ungrounded figure reaches the member through any field", () => {
  const placements: Array<[string, (payload: any) => void]> = [
    ["symptomPattern.summary", (p) => { p.symptomPattern.summary = "Symptoms rose 87% this month."; }],
    ["moodPattern.summary", (p) => { p.moodPattern.summary = "Mood improved 87%."; }],
    ["sleepPattern.summary", (p) => { p.sleepPattern.summary = "Sleep disturbance fell 87%."; }],
    ["energyPattern.summary", (p) => { p.energyPattern.summary = "Energy rose 87%."; }],
    ["lifestyleObservations", (p) => { p.lifestyleObservations = ["Your load rose 87%."]; }],
    ["suggestedNextSteps", (p) => { p.suggestedNextSteps = [{ horizon: "today", action: "Log 87% more." }]; }],
    ["personalizedRecommendations", (p) => { p.personalizedRecommendations[0].what = "Lift your load 87%."; }],
  ];

  for (const [field, mutate] of placements) {
    it(`strips an invented figure from ${field}`, async () => {
      const payload = validSnapshotPayload(SLEEP_CITATION_ID);
      mutate(payload);

      await runWithMed42Answering(JSON.stringify(payload), async () => {
        const result = await runGateway(snapshotRequest());

        assert.equal(result.ok, true, "the response should survive via repair, not fail");
        if (!result.ok) return;

        assert.ok(
          !JSON.stringify(result.output).includes(UNGROUNDED),
          `an invented figure shipped through ${field}: ${JSON.stringify(result.output)}`
        );
      });
    });
  }
});