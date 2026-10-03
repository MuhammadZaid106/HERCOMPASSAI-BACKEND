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
 * Smallest prior average a percentage change may be computed from.
 *
 * A ratio against a baseline of zero is undefined, and dividing by an arbitrary
 * epsilon manufactures a spectacularly wrong number rather than a merely
 * imprecise one: a move from 0 to 3 under the old fixed epsilon floor reported
 * "+600%", and that figure was then injected into the deterministic metric bag,
 * which makes it explicitly stateable by the model and presentable on the
 * member's own dashboard.
 *
 * Below this baseline the percentage is reported as `null` and only the
 * direction is stated. Direction is unaffected: `classifyTrend` still compares
 * against the floored denominator, so a genuine rise from zero is still
 * classified `increasing` — it simply is not dressed up with a figure the data
 * cannot support.
 */
export const MIN_PERCENT_CHANGE_BASELINE = 0.5;

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

/**
 * Relative change against a floored denominator.
 *
 * Used only to classify a direction, never to produce a reported figure: the
 * floor keeps a near-zero baseline from collapsing the ratio, but any number
 * derived from it is a classification aid rather than a measurement.
 */
function ratioChange(recent: number, prior: number): number {
  const denominator = Math.max(Math.abs(prior), MIN_PERCENT_CHANGE_BASELINE);
  return ((recent - prior) / denominator) * 100;
}

/**
 * The percentage change to publish, or `null` when the baseline is too small for
 * one to mean anything.
 */
function percentChange(recent: number, prior: number): number | null {
  if (Math.abs(prior) < MIN_PERCENT_CHANGE_BASELINE) return null;
  return Math.round(ratioChange(recent, prior));
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
  const hasBothAverages = sufficientData && recentAverage !== null && priorAverage !== null;
  const changePercent = hasBothAverages
    ? percentChange(recentAverage as number, priorAverage as number)
    : null;
  return {
    // Classified from the floored ratio rather than from the published figure, so
    // a move away from a near-zero baseline is still reported as a direction
    // instead of being flattened to "stable" by the missing percentage.
    trend: hasBothAverages
      ? classifyTrend(ratioChange(recentAverage as number, priorAverage as number))
      : "stable",
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
  // Copied, not normalised in place. The engine is a pure function over its
  // input, and normalising the caller's own Date object mutated it — a caller
  // that reused one `today` across several calculations, or logged it, would
  // silently observe a shifted timestamp it never asked for.
  const today = new Date((input.today ?? new Date()).getTime());
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
