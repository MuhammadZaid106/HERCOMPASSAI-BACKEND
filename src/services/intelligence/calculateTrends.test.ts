/**
 * Run: pnpm exec tsx src/services/intelligence/calculateTrends.test.ts
 */
import assert from "node:assert/strict";
import {
  calculateMemberTrends,
  calculateCheckInStreak,
  TREND_CHANGE_THRESHOLD_PERCENT,
  MIN_PERCENT_CHANGE_BASELINE,
} from "./calculateTrends.js";

const today = new Date("2026-09-28T12:00:00.000Z");

function datesConsecutive(from: string, count: number): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T12:00:00.000Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Streak: today + 2 prior days
{
  const streakDates = ["2026-09-28", "2026-09-27", "2026-09-26", "2026-09-20"];
  assert.equal(calculateCheckInStreak(streakDates, today), 3);
}

// Mood increases ~100%: prior avg 2, recent avg 4 → +100% → increasing
{
  const moodPoints = [
    { date: "2026-09-22", value: 2 },
    { date: "2026-09-23", value: 2 },
    { date: "2026-09-26", value: 4 },
    { date: "2026-09-27", value: 4 },
  ];
  const logged = datesConsecutive("2026-09-22", 6);
  const result = calculateMemberTrends({
    rangeDays: 7,
    today,
    symptomPoints: [],
    moodPoints,
    sleepPoints: [],
    energyPoints: [],
    loggedDates: logged,
  });
  assert.equal(result.insufficientData, false);
  assert.equal(result.mood.trend, "increasing");
  assert.equal(result.mood.changePercent, 100);
}

// Stable band within threshold
{
  const sleepPoints = [
    { date: "2026-09-22", value: 3 },
    { date: "2026-09-24", value: 3 },
    { date: "2026-09-26", value: 3.2 },
    { date: "2026-09-27", value: 3.2 },
  ];
  const result = calculateMemberTrends({
    rangeDays: 7,
    today,
    symptomPoints: [],
    moodPoints: [],
    sleepPoints,
    energyPoints: [],
    loggedDates: sleepPoints.map((p) => p.date),
  });
  assert.equal(result.sleep.trend, "stable");
}

assert.equal(TREND_CHANGE_THRESHOLD_PERCENT, 10);

// The engine must not normalise the caller's own Date object in place.
{
  const supplied = new Date("2026-09-28T00:00:00.000Z");
  const before = supplied.toISOString();
  calculateMemberTrends({
    rangeDays: 7,
    today: supplied,
    symptomPoints: [],
    moodPoints: [],
    sleepPoints: [],
    energyPoints: [],
    loggedDates: [],
  });
  assert.equal(
    supplied.toISOString(),
    before,
    "calculateMemberTrends must not mutate the Date it was given"
  );
}

// A percentage change against a near-zero baseline is undefined and must not be
// reported as a figure, but the direction of the move is still real.
{
  const result = calculateMemberTrends({
    rangeDays: 30,
    today,
    symptomPoints: [
      { date: "2026-09-08", value: 0 },
      { date: "2026-09-09", value: 0 },
      { date: "2026-09-24", value: 3 },
      { date: "2026-09-25", value: 3 },
    ],
    moodPoints: [],
    sleepPoints: [],
    energyPoints: [],
    loggedDates: ["2026-09-08", "2026-09-09", "2026-09-24", "2026-09-25"],
  });

  assert.equal(result.symptoms.priorAverage, 0);
  assert.equal(result.symptoms.recentAverage, 3);
  assert.equal(
    result.symptoms.changePercent,
    null,
    "a ratio against a zero baseline must be reported as absent, not as +600%"
  );
  assert.equal(
    result.symptoms.trend,
    "increasing",
    "the direction of a real move must survive the missing percentage"
  );
  assert.equal(result.symptoms.sufficientData, true);
}

// A usable baseline still reports a percentage.
{
  const result = calculateMemberTrends({
    rangeDays: 30,
    today,
    symptomPoints: [
      { date: "2026-09-08", value: 2 },
      { date: "2026-09-09", value: 2 },
      { date: "2026-09-24", value: 3 },
      { date: "2026-09-25", value: 3 },
    ],
    moodPoints: [],
    sleepPoints: [],
    energyPoints: [],
    loggedDates: ["2026-09-08", "2026-09-09", "2026-09-24", "2026-09-25"],
  });

  assert.equal(result.symptoms.changePercent, 50);
  assert.equal(result.symptoms.trend, "increasing");
}

assert.equal(MIN_PERCENT_CHANGE_BASELINE, 0.5);

// Two calls with the same input must agree, including when the caller reuses one
// Date across them.
{
  const shared = new Date("2026-09-28T00:00:00.000Z");
  const input = {
    rangeDays: 30 as const,
    today: shared,
    symptomPoints: [
      { date: "2026-09-08", value: 1 },
      { date: "2026-09-24", value: 4 },
    ],
    moodPoints: [],
    sleepPoints: [],
    energyPoints: [],
    loggedDates: ["2026-09-08", "2026-09-24"],
  };

  const first = calculateMemberTrends(input);
  const second = calculateMemberTrends(input);
  assert.deepEqual(first, second, "the engine must be a pure function of its input");
}

console.log("[OK] calculateTrends unit checks passed");
