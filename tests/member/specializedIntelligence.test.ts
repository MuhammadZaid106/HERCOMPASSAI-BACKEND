import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { nutritionRadarService } from "../../src/services/intelligence/nutritionRadarService.js";
import { correlationEngine } from "../../src/services/intelligence/correlationEngine.js";
import { coupleChallengesService } from "../../src/services/partner/coupleChallengesService.js";

describe("Specialized Experience Modules (Maria's Story Nuances)", () => {
  it("calculates Nutrition Radar and identifies magnesium deficit on night sweats and insomnia", () => {
    const profile = nutritionRadarService.calculateProfile({
      symptoms: ["Night sweats", "Sleep disruption"],
      sleepHours: 4,
      notes: "Stressful week, evening fatigue",
    });

    assert.ok(profile.scores.magnesium < 70, "Expected magnesium deficit signal");
    assert.ok(profile.primaryDeficit.includes("Magnesium"));
    assert.ok(profile.recommendedRecipeSlugs.length > 0);
    assert.ok(profile.recommendedNutrients.some((n) => n.toLowerCase().includes("magnesium")));
  });

  it("calculates predictive percentage correlations linking lifestyle interventions to symptom trajectories", () => {
    const predictions = correlationEngine.calculatePredictions({
      symptoms: ["Night sweats", "Insomnia"],
      sleepDisturbance: true,
      stressLevel: "high",
    });

    assert.ok(predictions.length >= 2);
    const sleepPrediction = predictions.find((p) => p.category === "nutrition");
    assert.ok(sleepPrediction);
    assert.equal(sleepPrediction?.percentageLikelihood, 25);
    assert.ok(sleepPrediction?.statement.includes("25% likely to improve"));

    const walkPrediction = predictions.find((p) => p.category === "movement");
    assert.ok(walkPrediction);
    assert.equal(walkPrediction?.percentageLikelihood, 18);
    assert.ok(walkPrediction?.statement.includes("18%"));
  });

  it("tracks mutual couple challenges progress without violating privacy", async () => {
    const challenges = coupleChallengesService.getAvailableChallenges();
    assert.ok(challenges.length >= 3);
    assert.ok(challenges.some((c) => c.id === "evening-cooling-walks"));

    const progress = await coupleChallengesService.getChallengeProgress("test-pair-1");
    assert.ok(progress.length >= 3);

    const updated = await coupleChallengesService.recordActivity("test-pair-1", "evening-cooling-walks", "partner");
    assert.ok(updated.completedCount >= 1);
    assert.equal(updated.partnerCompletedToday, true);
  });
});
