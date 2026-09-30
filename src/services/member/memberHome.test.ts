/**
 * Run: pnpm exec tsx src/services/member/memberHome.test.ts
 */
import assert from "node:assert/strict";
import { buildHomeNextStep } from "./homeNextStep.js";
import {
  buildDashboardHomeView,
  calendarTodayKey,
  entryDateKey,
  parseSnapshotScores,
} from "./dashboardHome.js";

const today = calendarTodayKey(new Date("2026-09-29T16:00:00.000Z"));
assert.equal(today, "2026-09-29");
assert.equal(entryDateKey("2026-09-28"), "2026-09-28");

assert.equal(parseSnapshotScores({ symptomBurdenScore: "nope" }), null);
const parsed = parseSnapshotScores({
  symptomBurdenScore: 40,
  sleepDisturbanceScore: 55,
  vitalityIndex: 62,
  emotionalBalanceScore: 48,
  dominantFocusArea: "Sleep deeply through the night",
});
assert.equal(parsed?.dominantFocusArea, "Sleep deeply through the night");
assert.equal(parsed?.scores.vitalityIndex, 62);

const symptom = {
  entryDate: "2026-09-28",
  symptoms: ["Hot flashes"],
};

const view = buildDashboardHomeView({
  todayKey: "2026-09-29",
  snapshotCompleted: true,
  deterministicScores: {
    symptomBurdenScore: 40,
    sleepDisturbanceScore: 55,
    vitalityIndex: 62,
    emotionalBalanceScore: 48,
    dominantFocusArea: "Sleep deeply through the night",
  },
  latestSymptom: symptom,
  latestMood: null,
  latestSleep: null,
  latestEnergy: null,
});

assert.equal(view.today.symptom, null);
assert.equal(view.latest.symptom?.label, "1 symptom logged");
assert.equal(view.checkIn.loggedToday, 0);
assert.equal(view.nextStep.href, "/app/track?tab=symptoms");
assert.equal(view.snapshot.scores?.sleepDisturbanceScore, 55);

const finished = buildHomeNextStep({
  checkInComplete: true,
  firstMissingTab: null,
  snapshotAvailable: true,
  dominantFocusArea: "Sleep deeply through the night",
});
assert.equal(finished.href, "/app/snapshot");
assert.match(finished.body, /sleep/i);

const noSnapshot = buildHomeNextStep({
  checkInComplete: true,
  firstMissingTab: null,
  snapshotAvailable: false,
  dominantFocusArea: null,
});
assert.equal(noSnapshot.href, "/onboarding");

console.log("[OK] member home checks passed");
