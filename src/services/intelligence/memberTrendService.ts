/**
 * Deterministic Trend Engine — member data bridge.
 *
 * `calculateMemberTrends` is pure arithmetic over daily points. This module is
 * the only place that knows how a stored tracking row becomes a number, and it
 * exists so that the AI Gateway can be handed *verified calculations* rather
 * than raw member records.
 *
 * The architectural rule this file protects: the model interprets numbers that
 * deterministic software already produced. It never sees a symptom note, a
 * journal string or a lifestyle row, and it certainly never derives a trend
 * itself.
 */

import { Op } from "sequelize";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  SleepEntry,
  SymptomEntry,
} from "../../models/index.js";
import { calculateMemberTrends } from "./calculateTrends.js";
import type { DailyPoint, TrendEngineOutput } from "./trendTypes.js";

export type TrendRangeDays = 7 | 30 | 90;

/**
 * Sleep quality is an ordered categorical, not a number in the database.
 * Mapping it to an ordinal is a deterministic transformation performed here
 * rather than in a prompt, so the model only ever sees the derived value.
 */
const SLEEP_QUALITY_SCORE: Record<string, number> = {
  poor: 1,
  fair: 2,
  good: 3,
  very_good: 4,
};

function rangeStart(rangeDays: TrendRangeDays): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  return start.toISOString().slice(0, 10);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Symptom load per day.
 *
 * `intensity` is the member's own 1-10 rating when supplied, because it is the
 * most direct signal of perceived burden. Without it we fall back to how many
 * distinct symptoms were logged, which is a count and not a severity, so the
 * two are never mixed in the same series.
 */
function symptomPoints(entries: Array<{ entryDate: string; symptoms: string[]; intensity: number | null }>): DailyPoint[] {
  const rated = entries.filter((entry) => finite(entry.intensity) !== null);
  if (rated.length > 0) {
    return rated.map((entry) => ({
      date: entry.entryDate,
      value: entry.intensity as number,
    }));
  }

  return entries
    .filter((entry) => (entry.symptoms?.length ?? 0) > 0)
    .map((entry) => ({ date: entry.entryDate, value: entry.symptoms.length }));
}

function toPoints<T>(
  rows: Array<{ entryDate: string }>,
  value: (row: T) => number | null
): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (const row of rows) {
    const resolved = value(row as unknown as T);
    if (resolved !== null) points.push({ date: row.entryDate, value: resolved });
  }
  return points;
}

export interface MemberTrendInput {
  symptomPoints: DailyPoint[];
  moodPoints: DailyPoint[];
  sleepPoints: DailyPoint[];
  energyPoints: DailyPoint[];
  loggedDates: string[];
}

/**
 * Loads the daily points the Trend Engine needs.
 *
 * One parallel read per domain — the Gateway calls this once per AI request, so
 * it must not fan out into per-row queries.
 */
export async function loadMemberTrendInput(
  userId: string,
  rangeDays: TrendRangeDays
): Promise<MemberTrendInput> {
  const where = { userId, entryDate: { [Op.gte]: rangeStart(rangeDays) } };

  const [symptoms, moods, sleep, energy, lifestyle] = await Promise.all([
    SymptomEntry.findAll({ where, attributes: ["entryDate", "symptoms", "intensity"] }),
    MoodEntry.findAll({ where, attributes: ["entryDate", "moodLevel"] }),
    SleepEntry.findAll({ where, attributes: ["entryDate", "quality"] }),
    EnergyEntry.findAll({ where, attributes: ["entryDate", "energyLevel"] }),
    LifestyleEntry.findAll({ where, attributes: ["entryDate"] }),
  ]);

  const loggedDates = new Set<string>();
  for (const entry of [...symptoms, ...moods, ...sleep, ...energy, ...lifestyle]) {
    if (entry.entryDate) loggedDates.add(entry.entryDate);
  }

  return {
    symptomPoints: symptomPoints(symptoms),
    moodPoints: toPoints<{ entryDate: string; moodLevel: number }>(moods, (row) =>
      finite(row.moodLevel)
    ),
    sleepPoints: toPoints<{ entryDate: string; quality: string }>(sleep, (row) => {
      const score = SLEEP_QUALITY_SCORE[row.quality];
      return score === undefined ? null : score;
    }),
    energyPoints: toPoints<{ entryDate: string; energyLevel: number }>(energy, (row) =>
      finite(row.energyLevel)
    ),
    loggedDates: Array.from(loggedDates).sort(),
  };
}

/**
 * The verified calculations handed to the AI Gateway for interpretation.
 *
 * A member who has never logged anything still gets a well-formed result — the
 * engine reports `insufficientData: true` and null averages rather than
 * throwing, so "no data yet" is an explicit, machine-readable fact the prompt
 * can state instead of the model guessing.
 */
export async function loadMemberTrendEngineOutput(
  userId: string,
  rangeDays: TrendRangeDays
): Promise<TrendEngineOutput> {
  const input = await loadMemberTrendInput(userId, rangeDays);
  return calculateMemberTrends({
    rangeDays,
    // The sufficiency threshold comes from gateway config so the Snapshot, the
    // Progress dashboard and the prompt can never disagree about when a member
    // has "enough" data to describe a change.
    minimumDaysForPatterns: AI_GATEWAY_CONFIG.trendEngine.minimumDaysForPatterns,
    ...input,
  });
}
