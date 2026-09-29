/**
 * Deterministic Trend Engine (MVP)
 * Directive: Deterministic software calculates; AI interprets later via Gateway.
 */

import type {
  CalculateTrendsInput,
  DailyPoint,
  DomainTrend,
  TrendDirection,
  TrendEngineOutput,
} from "./trendTypes.js";

/** Percent change at or above/below this magnitude → increasing / decreasing */
export const TREND_CHANGE_THRESHOLD_PERCENT = 10;

/**
 * Fallback sufficiency threshold.
 *
 * `AI_GATEWAY_CONFIG.trendEngine.minimumDaysForPatterns` is the authority; this
 * constant only applies when the engine is called without the setting, e.g. from
 * a unit test that wants a fixed baseline.
 */
export const DEFAULT_MINIMUM_DAYS_FOR_PATTERNS = 3;

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(recent: number, prior: number): number | null {
  const denominator = Math.max(Math.abs(prior), 0.5);
  return Math.round(((recent - prior) / denominator) * 100);
}

function classifyTrend(changePercent: number | null): TrendDirection {
  if (changePercent === null) return "stable";
  if (changePercent >= TREND_CHANGE_THRESHOLD_PERCENT) return "increasing";
  if (changePercent <= -TREND_CHANGE_THRESHOLD_PERCENT) return "decreasing";
  return "stable";
}

function parseDate(date: string): Date {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function windowStart(today: Date, rangeDays: number): Date {
  const start = new Date(today);
  start.setUTCHours(12, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  return start;
}

function midpointDate(today: Date, rangeDays: number): Date {
  const start = windowStart(today, rangeDays);
  const end = new Date(today);
  end.setUTCHours(12, 0, 0, 0);
  const midMs = start.getTime() + (end.getTime() - start.getTime()) / 2;
  return new Date(midMs);
}

function splitPointsByHalves(
  points: DailyPoint[],
  today: Date,
  rangeDays: number,
): { recent: number[]; prior: number[] } {
  const mid = midpointDate(today, rangeDays);
  const recent: number[] = [];
  const prior: number[] = [];
  for (const point of points) {
    const day = parseDate(point.date);
    if (day.getTime() < windowStart(today, rangeDays).getTime()) continue;
    if (day.getTime() > today.getTime()) continue;
    if (day.getTime() >= mid.getTime()) recent.push(point.value);
    else prior.push(point.value);
  }
  return { recent, prior };
}

function buildDomainTrend(
  points: DailyPoint[],
  today: Date,
  rangeDays: number,
): DomainTrend {
  const { recent, prior } = splitPointsByHalves(points, today, rangeDays);
  const recentAverage = mean(recent);
  const priorAverage = mean(prior);
  const sufficientData = recent.length >= 1 && prior.length >= 1;
  const changePercent =
    sufficientData && recentAverage !== null && priorAverage !== null
      ? percentChange(recentAverage, priorAverage)
      : null;
  return {
    trend: classifyTrend(changePercent),
    changePercent,
    recentAverage:
      recentAverage !== null ? Math.round(recentAverage * 10) / 10 : null,
    priorAverage:
      priorAverage !== null ? Math.round(priorAverage * 10) / 10 : null,
    sufficientData,
  };
}

export function calculateCheckInStreak(
  loggedDates: string[],
  today: Date = new Date(),
): number {
  const unique = new Set(loggedDates);
  let streak = 0;
  const cursor = new Date(today);
  cursor.setUTCHours(12, 0, 0, 0);

  while (true) {
    const key = formatDate(cursor);
    if (!unique.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (streak > 366) break;
  }
  return streak;
}

function buildPatternIndicators(
  symptoms: DomainTrend,
  mood: DomainTrend,
  sleep: DomainTrend,
  energy: DomainTrend,
  consistencyScore: number,
): string[] {
  const indicators: string[] = [];

  if (
    symptoms.sufficientData &&
    symptoms.trend === "increasing" &&
    (symptoms.changePercent ?? 0) >= 15
  ) {
    indicators.push(
      "Your logs suggest symptom entries were more frequent in the recent part of this window.",
    );
  }

  if (
    mood.sufficientData &&
    sleep.sufficientData &&
    mood.trend === "decreasing" &&
    sleep.trend === "decreasing"
  ) {
    indicators.push(
      "Your logged mood and sleep averages both shifted lower in the recent part of this window.",
    );
  }

  if (
    energy.sufficientData &&
    energy.trend === "increasing" &&
    (energy.changePercent ?? 0) >= 15
  ) {
    indicators.push(
      "Your logged energy average looks higher in the recent part of this window.",
    );
  }

  if (consistencyScore < 35) {
    indicators.push(
      "More regular check-ins would help your descriptive trends become clearer.",
    );
  }

  return indicators.slice(0, 3);
}

export function calculateMemberTrends(
  input: CalculateTrendsInput,
): TrendEngineOutput {
  const today = input.today ?? new Date();
  today.setUTCHours(12, 0, 0, 0);
  const rangeDays = input.rangeDays;

  const windowStartDate = windowStart(today, rangeDays);
  const datesInWindow = new Set<string>();
  for (const date of input.loggedDates) {
    const parsed = parseDate(date);
    if (
      parsed.getTime() >= windowStartDate.getTime() &&
      parsed.getTime() <= today.getTime()
    ) {
      datesInWindow.add(date);
    }
  }

  const daysWithAnyEntry = datesInWindow.size;
  const consistencyScore = Math.min(
    100,
    Math.round((daysWithAnyEntry / rangeDays) * 100),
  );

  const streakDates = input.loggedDates;
  const checkInStreak = calculateCheckInStreak(streakDates, today);

  const symptoms = buildDomainTrend(input.symptomPoints, today, rangeDays);
  const mood = buildDomainTrend(input.moodPoints, today, rangeDays);
  const sleep = buildDomainTrend(input.sleepPoints, today, rangeDays);
  const energy = buildDomainTrend(input.energyPoints, today, rangeDays);

  const symptomValues = input.symptomPoints
    .filter((point) => {
      const day = parseDate(point.date);
      return (
        day.getTime() >= windowStartDate.getTime() &&
        day.getTime() <= today.getTime()
      );
    })
    .map((point) => point.value);
  const symptomFrequency =
    symptomValues.length > 0
      ? Math.round((mean(symptomValues) ?? 0) * 10) / 10
      : null;

  const insufficientData =
    daysWithAnyEntry < (input.minimumDaysForPatterns ?? DEFAULT_MINIMUM_DAYS_FOR_PATTERNS);

  const patternIndicators = insufficientData
    ? []
    : buildPatternIndicators(symptoms, mood, sleep, energy, consistencyScore);

  return {
    rangeDays,
    insufficientData,
    checkInStreak,
    consistencyScore,
    daysWithAnyEntry,
    symptomFrequency,
    symptoms,
    mood,
    sleep,
    energy,
    patternIndicators,
  };
}
