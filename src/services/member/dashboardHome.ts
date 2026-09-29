import { z } from "zod";
import {
  buildHomeNextStep,
  type CheckInTab,
  type HomeNextStep,
} from "./homeNextStep.js";

type SleepQuality = "poor" | "fair" | "good" | "very_good";

interface SymptomLogSource {
  entryDate: string | Date;
  symptoms: string[];
}

interface MoodLogSource {
  entryDate: string | Date;
  moodLevel: number;
}

interface SleepLogSource {
  entryDate: string | Date;
  quality: SleepQuality;
}

interface EnergyLogSource {
  entryDate: string | Date;
  energyLevel: number;
}

export interface DomainLogSummary {
  entryDate: string;
  label: string;
}

export interface DashboardDomainLogs {
  symptom: DomainLogSummary | null;
  mood: DomainLogSummary | null;
  sleep: DomainLogSummary | null;
  energy: DomainLogSummary | null;
}

export interface SnapshotScores {
  symptomBurdenScore: number;
  sleepDisturbanceScore: number;
  vitalityIndex: number;
  emotionalBalanceScore: number;
}

export interface DashboardSnapshot {
  available: boolean;
  dominantFocusArea: string | null;
  scores: SnapshotScores | null;
}

const snapshotScoresSchema = z.object({
  symptomBurdenScore: z.number().finite(),
  sleepDisturbanceScore: z.number().finite(),
  vitalityIndex: z.number().finite(),
  emotionalBalanceScore: z.number().finite(),
  dominantFocusArea: z.string().trim().min(1).optional(),
});

const SLEEP_LABEL: Record<SleepQuality, string> = {
  poor: "Poor sleep",
  fair: "Fair sleep",
  good: "Good sleep",
  very_good: "Very good sleep",
};

export const SLEEP_QUALITY_POINTS: Record<SleepQuality, number> = {
  poor: 1,
  fair: 2,
  good: 3,
  very_good: 4,
};

/** Same calendar key the tracking APIs store on entryDate. */
export function calendarTodayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function entryDateKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function parseSnapshotScores(
  value: unknown,
): { dominantFocusArea: string | null; scores: SnapshotScores } | null {
  const parsed = snapshotScoresSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    dominantFocusArea: parsed.data.dominantFocusArea ?? null,
    scores: {
      symptomBurdenScore: parsed.data.symptomBurdenScore,
      sleepDisturbanceScore: parsed.data.sleepDisturbanceScore,
      vitalityIndex: parsed.data.vitalityIndex,
      emotionalBalanceScore: parsed.data.emotionalBalanceScore,
    },
  };
}

function symptomLabel(entry: SymptomLogSource): string {
  const count = entry.symptoms.length;
  return count === 1 ? "1 symptom logged" : `${count} symptoms logged`;
}

export function summarizeSymptom(entry: SymptomLogSource | null): DomainLogSummary | null {
  if (!entry) return null;
  return { entryDate: entryDateKey(entry.entryDate), label: symptomLabel(entry) };
}

export function summarizeMood(entry: MoodLogSource | null): DomainLogSummary | null {
  if (!entry) return null;
  return {
    entryDate: entryDateKey(entry.entryDate),
    label: `Mood ${entry.moodLevel}/5`,
  };
}

export function summarizeSleep(entry: SleepLogSource | null): DomainLogSummary | null {
  if (!entry) return null;
  return {
    entryDate: entryDateKey(entry.entryDate),
    label: SLEEP_LABEL[entry.quality],
  };
}

export function summarizeEnergy(entry: EnergyLogSource | null): DomainLogSummary | null {
  if (!entry) return null;
  return {
    entryDate: entryDateKey(entry.entryDate),
    label: `Energy ${entry.energyLevel}/5`,
  };
}

export function loggedOnDay(
  summary: DomainLogSummary | null,
  todayKey: string,
): DomainLogSummary | null {
  if (!summary || summary.entryDate !== todayKey) return null;
  return summary;
}

const TAB_ORDER: CheckInTab[] = ["symptoms", "mood", "sleep", "energy"];

export function firstMissingTab(
  today: DashboardDomainLogs,
): CheckInTab | null {
  for (const tab of TAB_ORDER) {
    const summary =
      tab === "symptoms"
        ? today.symptom
        : tab === "mood"
          ? today.mood
          : tab === "sleep"
            ? today.sleep
            : today.energy;
    if (!summary) return tab;
  }
  return null;
}

export function countLoggedToday(today: DashboardDomainLogs): number {
  return [today.symptom, today.mood, today.sleep, today.energy].filter(Boolean)
    .length;
}

export interface DashboardHomeView {
  today: DashboardDomainLogs;
  latest: DashboardDomainLogs;
  checkIn: { loggedToday: number; total: 4 };
  snapshot: DashboardSnapshot;
  nextStep: HomeNextStep;
}

export function buildDashboardHomeView(input: {
  todayKey: string;
  snapshotCompleted: boolean;
  deterministicScores: unknown;
  latestSymptom: SymptomLogSource | null;
  latestMood: MoodLogSource | null;
  latestSleep: SleepLogSource | null;
  latestEnergy: EnergyLogSource | null;
}): DashboardHomeView {
  const latest: DashboardDomainLogs = {
    symptom: summarizeSymptom(input.latestSymptom),
    mood: summarizeMood(input.latestMood),
    sleep: summarizeSleep(input.latestSleep),
    energy: summarizeEnergy(input.latestEnergy),
  };
  const today: DashboardDomainLogs = {
    symptom: loggedOnDay(latest.symptom, input.todayKey),
    mood: loggedOnDay(latest.mood, input.todayKey),
    sleep: loggedOnDay(latest.sleep, input.todayKey),
    energy: loggedOnDay(latest.energy, input.todayKey),
  };
  const parsed = parseSnapshotScores(input.deterministicScores);
  const snapshot: DashboardSnapshot = {
    available: input.snapshotCompleted,
    dominantFocusArea: input.snapshotCompleted
      ? (parsed?.dominantFocusArea ?? null)
      : null,
    scores: input.snapshotCompleted ? (parsed?.scores ?? null) : null,
  };
  const loggedToday = countLoggedToday(today);
  return {
    today,
    latest,
    checkIn: { loggedToday, total: 4 },
    snapshot,
    nextStep: buildHomeNextStep({
      checkInComplete: loggedToday === 4,
      firstMissingTab: firstMissingTab(today),
      snapshotAvailable: snapshot.available,
      dominantFocusArea: snapshot.dominantFocusArea,
    }),
  };
}
