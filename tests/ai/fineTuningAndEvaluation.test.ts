import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { fineTuningService } from "../../src/services/ml/fineTuningService.js";
import { evaluationRunner } from "../../src/services/ml/evaluationRunner.js";

describe("Fine-Tuning Pipeline & Evaluation Benchmark", () => {
  it("exports clinician-verified training pairs with required fields in JSONL format", async () => {
    const dataset = await fineTuningService.exportClinicianDataset();

    assert.ok(dataset.count > 0);
    assert.ok(dataset.examples.length > 0);
    assert.ok(dataset.jsonl.length > 0);

    const first = dataset.examples[0];
    assert.ok(first.claim.length > 0);
    assert.ok(first.source.length > 0);
    assert.ok(["High", "Moderate"].includes(first.confidence));
    assert.ok(first.messages.length === 3);
    assert.equal(first.messages[0].role, "system");
    assert.equal(first.messages[1].role, "user");
    assert.equal(first.messages[2].role, "assistant");

    // Must never contain diagnostic prescriptions
    assert.ok(!first.messages[2].content.includes("I prescribe"));
  });

  it("generates valid LoRA hyperparameters for Llama 3 and Med42", () => {
    const llamaConfig = fineTuningService.getLoraConfig("llama-3");
    assert.equal(llamaConfig.architecture, "llama-3");
    assert.equal(llamaConfig.loraRank, 16);
    assert.equal(llamaConfig.loraAlpha, 32);
    assert.ok(llamaConfig.targetModules.includes("q_proj"));

    const med42Config = fineTuningService.getLoraConfig("med42");
    assert.equal(med42Config.architecture, "med42");
    assert.ok(med42Config.baseModel.includes("med42"));
  });

  it("runs candidate model evaluation benchmark and produces comparative scorecard", async () => {
    const scorecard = await evaluationRunner.runCandidateBenchmark({
      candidateModel: "med42-candidate-test",
    });

    assert.ok(scorecard.runId);
    assert.equal(scorecard.candidateModel, "med42-candidate-test");
    assert.ok(scorecard.totalCases >= 0);
    assert.ok(typeof scorecard.passRate === "string");
    assert.ok(typeof scorecard.citationAccuracyRate === "string");
    assert.ok(typeof scorecard.nonDiagnosticComplianceRate === "string");
    assert.ok(scorecard.deltaVsBaseline);
  });
});
