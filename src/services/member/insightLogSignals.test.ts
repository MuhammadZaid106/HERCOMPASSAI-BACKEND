/**
 * Run: pnpm exec tsx src/services/member/insightLogSignals.test.ts
 */
import assert from "node:assert/strict";
import { insightLogSignalsFromTrends } from "./insightLogSignals.js";
import type { DomainTrend, TrendEngineOutput } from "../intelligence/trendTypes.js";

function domain(trend: DomainTrend["trend"], changePercent: number | null, sufficient = true): DomainTrend {
  return {
    trend,
    changePercent,
    recentAverage: null,
    priorAverage: null,
    sufficientData: sufficient,
  };
}

const signals = insightLogSignalsFromTrends({
  rangeDays: 30,
  insufficientData: false,
  checkInStreak: 3,
  consistencyScore: 40,
  daysWithAnyEntry: 6,
  symptomFrequency: 1,
  symptoms: domain("increasing", 20),
  mood: domain("stable", null, false),
  sleep: domain("decreasing", -15),
  energy: domain("stable", 0),
  patternIndicators: [],
} satisfies TrendEngineOutput);

assert.equal(signals.sleepTrend, "decreasing");
assert.equal(signals.sleepChangePercent, -15);
assert.equal(signals.moodTrend, "not_enough_logs");
assert.equal(typeof signals.symptomChangePercent, "number");

console.log("[OK] insight log signal checks passed");
