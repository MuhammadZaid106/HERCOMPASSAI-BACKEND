/**
 * Run: pnpm exec tsx src/services/member/buildInsights.test.ts
 */
import assert from "node:assert/strict";
import { buildMemberInsights } from "./buildInsights.js";
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

function trends(partial: Partial<TrendEngineOutput>): TrendEngineOutput {
  return {
    rangeDays: 30,
    insufficientData: false,
    checkInStreak: 4,
    consistencyScore: 40,
    daysWithAnyEntry: 8,
    symptomFrequency: 1,
    symptoms: domain("stable", 0),
    mood: domain("stable", 0),
    sleep: domain("stable", 0),
    energy: domain("stable", 0),
    patternIndicators: [],
    ...partial,
  };
}

const connected = buildMemberInsights(
  trends({
    sleep: domain("decreasing", -20),
    energy: domain("decreasing", -15),
  }),
);
assert.ok(connected.cards.some((card) => card.id === "connected-sleep-energy"));
assert.match(
  connected.cards.find((card) => card.id === "connected-sleep-energy")?.body ?? "",
  /does not show a cause/,
);

const early = buildMemberInsights(
  trends({
    insufficientData: true,
    daysWithAnyEntry: 1,
    symptoms: domain("stable", null, false),
    mood: domain("stable", null, false),
    sleep: domain("stable", null, false),
    energy: domain("stable", null, false),
  }),
);
assert.equal(early.cards.some((card) => card.section === "changing"), false);
assert.equal(early.cards.some((card) => card.section === "connected"), false);
assert.equal(early.learnMore.length, 3);

// Every window must route the member to their real personalised suggestions,
// including the early-data window where no trend card can fire.
const personal = early.cards.find((card) => card.id === "try-personalised");
assert.ok(personal, "expected a personalised-steps card");
assert.equal(personal.href, "/app/insights");
assert.equal(early.cards.filter((card) => card.id === "try-personalised").length, 1);

// The "what to try" cards must point at observation, never at treatment.
const declining = buildMemberInsights(
  trends({
    sleep: domain("decreasing", -20),
    energy: domain("decreasing", -15),
    mood: domain("decreasing", -10),
  }),
);
const tryCards = declining.cards.filter((card) => card.section === "try");
assert.ok(tryCards.length >= 2);
for (const card of tryCards) {
  assert.match(card.why, /trend|approved evidence|logged days/i);
  assert.doesNotMatch(card.body, /\byou should\b|\btake\b|\bstart taking\b/i);
}

console.log("[OK] insight checks passed");
