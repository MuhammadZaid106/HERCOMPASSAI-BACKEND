import { Op } from "sequelize";
import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  SleepEntry,
  SymptomEntry,
} from "../../models/index.js";
import { calculateMemberTrends } from "../intelligence/index.js";
import { entryDateKey, SLEEP_QUALITY_POINTS } from "./dashboardHome.js";
import { insightLogSignalsFromTrends, type InsightLogSignals } from "./insightLogSignals.js";

function windowStart(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

export async function loadInsightLogSignals(userId: string): Promise<InsightLogSignals> {
  const days = 30;
  const where = { userId, entryDate: { [Op.gte]: windowStart(days) } };
  const lookback = { userId, entryDate: { [Op.gte]: windowStart(90) } };
  const [symptoms, moods, sleep, energy, lifestyleDates] = await Promise.all([
    SymptomEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
    MoodEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
    SleepEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
    EnergyEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
    LifestyleEntry.findAll({ where: lookback, attributes: ["entryDate"] }),
  ]);
  const loggedDates = new Set<string>();
  for (const entry of symptoms) loggedDates.add(entryDateKey(entry.entryDate));
  for (const entry of moods) loggedDates.add(entryDateKey(entry.entryDate));
  for (const entry of sleep) loggedDates.add(entryDateKey(entry.entryDate));
  for (const entry of energy) loggedDates.add(entryDateKey(entry.entryDate));
  for (const entry of lifestyleDates) loggedDates.add(entryDateKey(entry.entryDate));

  return insightLogSignalsFromTrends(
    calculateMemberTrends({
      rangeDays: days,
      symptomPoints: symptoms.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.symptoms.length,
      })),
      moodPoints: moods.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.moodLevel,
      })),
      sleepPoints: sleep.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: SLEEP_QUALITY_POINTS[entry.quality],
      })),
      energyPoints: energy.map((entry) => ({
        date: entryDateKey(entry.entryDate),
        value: entry.energyLevel,
      })),
      loggedDates: [...loggedDates],
    }),
  );
}
