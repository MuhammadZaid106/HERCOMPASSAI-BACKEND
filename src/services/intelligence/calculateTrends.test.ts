/**
 * Run: pnpm exec tsx src/services/intelligence/calculateTrends.test.ts
 */
import assert from "node:assert/strict";
import {
  calculateMemberTrends,
  calculateCheckInStreak,
  TREND_CHANGE_THRESHOLD_PERCENT,
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

console.log("[OK] calculateTrends unit checks passed");
