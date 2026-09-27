import type { NextFunction, Response } from "express";
import { Op } from "sequelize";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  OnboardingProfile,
  SleepEntry,
  SymptomEntry,
  User,
} from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) { sendError(res, 401, "Authentication required"); return null; }
  if (req.user.role !== "member") { sendError(res, 403, "Only member accounts can access the member dashboard"); return null; }
  return req.user.userId;
}

function rangeDays(value: unknown): 7 | 30 | 90 {
  return value === "30d" ? 30 : value === "90d" ? 90 : 7;
}

function startDate(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

function average(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10 : null;
}

export async function getMemberDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const [user, profile, symptomEntry, moodEntry, sleepEntry, energyEntry] = await Promise.all([
      User.findByPk(userId, { attributes: ["id", "name", "plan"] }),
      OnboardingProfile.findOne({ where: { userId }, attributes: ["isCompleted", "completedAt", "deterministicScores"] }),
      SymptomEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      MoodEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      SleepEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
      EnergyEntry.findOne({ where: { userId }, order: [["entryDate", "DESC"]] }),
    ]);
    if (!user) { sendError(res, 404, "Member account not found"); return; }
    sendSuccess(res, 200, "Member dashboard retrieved", {
      member: user,
      onboarding: {
        completed: Boolean(profile?.isCompleted),
        completedAt: profile?.completedAt ?? null,
        snapshotAvailable: Boolean(profile?.isCompleted),
      },
      today: { symptom: symptomEntry, mood: moodEntry, sleep: sleepEntry, energy: energyEntry },
      deterministicScores: profile?.deterministicScores ?? null,
      partnerSupport: { interest: null },
    });
  } catch (error) { next(error); }
}

export async function getMemberProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const days = rangeDays(req.query.range);
    const where = { userId, entryDate: { [Op.gte]: startDate(days) } };
    const [symptoms, moods, sleep, energy, lifestyle] = await Promise.all([
      SymptomEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      MoodEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      SleepEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      EnergyEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
      LifestyleEntry.findAll({ where, order: [["entryDate", "ASC"]] }),
    ]);
    const symptomPoints = symptoms.map((entry) => ({ date: entry.entryDate, value: entry.symptoms.length }));
    const moodPoints = moods.map((entry) => ({ date: entry.entryDate, value: entry.moodLevel }));
    const sleepQualityMap = { poor: 1, fair: 2, good: 3, very_good: 4 } as const;
    const sleepPoints = sleep.map((entry) => ({ date: entry.entryDate, value: sleepQualityMap[entry.quality] }));
    const energyPoints = energy.map((entry) => ({ date: entry.entryDate, value: entry.energyLevel }));
    sendSuccess(res, 200, "Member progress retrieved", {
      range: `${days}d`,
      points: { symptoms: symptomPoints, mood: moodPoints, sleep: sleepPoints, energy: energyPoints },
      averages: {
        symptoms: average(symptomPoints.map((point) => point.value)),
        mood: average(moodPoints.map((point) => point.value)),
        sleep: average(sleepPoints.map((point) => point.value)),
        energy: average(energyPoints.map((point) => point.value)),
      },
      entryCount: symptoms.length + moods.length + sleep.length + energy.length + lifestyle.length,
    });
  } catch (error) { next(error); }
}