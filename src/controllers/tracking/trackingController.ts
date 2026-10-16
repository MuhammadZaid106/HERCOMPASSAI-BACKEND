import type { NextFunction, Response } from "express";
import { Op } from "sequelize";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import {
  EnergyEntry,
  LifestyleEntry,
  MoodEntry,
  SleepEntry,
  SymptomEntry,
} from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { invalidateMemberViews } from "../../services/member/memberCache.js";
import { notifyMember } from "../../services/notifications/notificationService.js";
import {
  energyEntrySchema,
  lifestyleEntrySchema,
  moodEntrySchema,
  sleepEntrySchema,
  symptomEntrySchema,
  trackingEntryParamsSchema,
  trackingQuerySchema,
  type TrackingEntryType,
} from "./trackingSchemas.js";
import type { Model, ModelStatic } from "sequelize";

const ENTRY_MODELS: Record<TrackingEntryType, ModelStatic<Model>> = {
  symptoms: SymptomEntry,
  mood: MoodEntry,
  sleep: SleepEntry,
  energy: EnergyEntry,
  lifestyle: LifestyleEntry,
};

const TYPE_LABEL: Record<TrackingEntryType, string> = {
  symptoms: "Symptoms",
  mood: "Mood",
  sleep: "Sleep",
  energy: "Energy",
  lifestyle: "Lifestyle",
};

function getMemberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (req.user.role !== "member") {
    sendError(res, 403, "Only member accounts can access personal tracking");
    return null;
  }
  return req.user.userId;
}

function getRangeStart(range: "7d" | "30d" | "90d"): Date {
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sends the daily check-in notice once the fourth area is logged.
 *
 * The notice must fire on the transition into "complete", not every time a
 * completed day is edited, so it is gated on the entry having just been created.
 * Editing an area later in the day finds an existing row and stays silent.
 *
 * Delivery is best-effort: counting failures are swallowed so a notification
 * problem can never fail the check-in the member just saved.
 */
async function notifyIfCheckInCompleted(
  userId: string,
  entryDate: string,
  created: boolean
): Promise<void> {
  if (!created) return;
  try {
    const counts = await Promise.all([
      SymptomEntry.count({ where: { userId, entryDate } }),
      MoodEntry.count({ where: { userId, entryDate } }),
      SleepEntry.count({ where: { userId, entryDate } }),
      EnergyEntry.count({ where: { userId, entryDate } }),
    ]);
    if (counts.some((count) => count === 0)) return;
    await notifyMember({
      userId,
      category: "tracking",
      title: "Daily check-in complete",
      body: "All four areas are logged for today. Your trends will refresh from here.",
      targetUrl: "/app/track",
    });
  } catch {
    // Intentionally ignored: see the doc comment above.
  }
}

export async function saveSymptomEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = symptomEntrySchema.safeParse({ entryDate: today(), ...req.body });
    if (!parsed.success) { sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors); return; }
    const [entry, created] = await SymptomEntry.findOrCreate({ where: { userId, entryDate: parsed.data.entryDate }, defaults: { userId, ...parsed.data } });
    if (!entry.isNewRecord) await entry.update(parsed.data);
    await invalidateMemberViews(userId);
    await notifyIfCheckInCompleted(userId, parsed.data.entryDate, created);
    sendSuccess(res, 200, "Symptoms saved", { entry });
  } catch (error) { next(error); }
}

export async function saveMoodEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = moodEntrySchema.safeParse({ entryDate: today(), ...req.body });
    if (!parsed.success) { sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors); return; }
    const [entry, created] = await MoodEntry.findOrCreate({ where: { userId, entryDate: parsed.data.entryDate }, defaults: { userId, ...parsed.data } });
    if (!entry.isNewRecord) await entry.update(parsed.data);
    await invalidateMemberViews(userId);
    await notifyIfCheckInCompleted(userId, parsed.data.entryDate, created);
    sendSuccess(res, 200, "Mood saved", { entry });
  } catch (error) { next(error); }
}

export async function saveSleepEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = sleepEntrySchema.safeParse({ entryDate: today(), ...req.body });
    if (!parsed.success) { sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors); return; }
    const [entry, created] = await SleepEntry.findOrCreate({ where: { userId, entryDate: parsed.data.entryDate }, defaults: { userId, ...parsed.data } });
    if (!entry.isNewRecord) await entry.update(parsed.data);
    await invalidateMemberViews(userId);
    await notifyIfCheckInCompleted(userId, parsed.data.entryDate, created);
    sendSuccess(res, 200, "Sleep saved", { entry });
  } catch (error) { next(error); }
}

export async function saveEnergyEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = energyEntrySchema.safeParse({ entryDate: today(), ...req.body });
    if (!parsed.success) { sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors); return; }
    const [entry, created] = await EnergyEntry.findOrCreate({ where: { userId, entryDate: parsed.data.entryDate }, defaults: { userId, ...parsed.data } });
    if (!entry.isNewRecord) await entry.update(parsed.data);
    await invalidateMemberViews(userId);
    await notifyIfCheckInCompleted(userId, parsed.data.entryDate, created);
    sendSuccess(res, 200, "Energy saved", { entry });
  } catch (error) { next(error); }
}

export async function saveLifestyleEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = lifestyleEntrySchema.safeParse({ entryDate: today(), ...req.body });
    if (!parsed.success) { sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors); return; }
    const [entry] = await LifestyleEntry.findOrCreate({ where: { userId, entryDate: parsed.data.entryDate }, defaults: { userId, ...parsed.data } });
    if (!entry.isNewRecord) await entry.update(parsed.data);
    await invalidateMemberViews(userId);
    sendSuccess(res, 200, "Lifestyle saved", { entry });
  } catch (error) { next(error); }
}

export async function getTrackingSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;
    const parsed = trackingQuerySchema.safeParse(req.query);
    if (!parsed.success) { sendError(res, 422, "Invalid range"); return; }
    const where = { userId, entryDate: { [Op.gte]: getRangeStart(parsed.data.range) } };
    const [symptoms, moods, sleep, energy, lifestyle] = await Promise.all([
      SymptomEntry.findAll({ where, order: [["entryDate", "DESC"]] }),
      MoodEntry.findAll({ where, order: [["entryDate", "DESC"]] }),
      SleepEntry.findAll({ where, order: [["entryDate", "DESC"]] }),
      EnergyEntry.findAll({ where, order: [["entryDate", "DESC"]] }),
      LifestyleEntry.findAll({ where, order: [["entryDate", "DESC"]] }),
    ]);
    sendSuccess(res, 200, "Tracking summary retrieved", {
      range: parsed.data.range,
      entries: { symptoms, moods, sleep, energy, lifestyle },
      counts: { symptoms: symptoms.length, moods: moods.length, sleep: sleep.length, energy: energy.length, lifestyle: lifestyle.length },
    });
  } catch (error) { next(error); }
}

/**
 * GET /api/tracking/:type/:id
 * Returns one entry the signed-in member owns.
 */
export async function getTrackingEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;

    const parsed = trackingEntryParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, "Choose a valid entry type and id");
      return;
    }

    const Model = ENTRY_MODELS[parsed.data.type];
    const entry = await Model.findOne({
      where: { id: parsed.data.id, userId },
    });
    if (!entry) {
      sendError(res, 404, "That entry was not found");
      return;
    }

    sendSuccess(res, 200, `${TYPE_LABEL[parsed.data.type]} entry retrieved`, {
      type: parsed.data.type,
      entry,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/tracking/:type/:id
 * Removes one entry the signed-in member owns. Other members' rows are never matched.
 */
export async function deleteTrackingEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getMemberId(req, res);
    if (!userId) return;

    const parsed = trackingEntryParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, "Choose a valid entry type and id");
      return;
    }

    const Model = ENTRY_MODELS[parsed.data.type];
    const entry = await Model.findOne({
      where: { id: parsed.data.id, userId },
    });
    if (!entry) {
      sendError(res, 404, "That entry was not found");
      return;
    }

    const snapshot = entry.toJSON() as Record<string, unknown>;
    await entry.destroy();
    await invalidateMemberViews(userId);
    sendSuccess(res, 200, `${TYPE_LABEL[parsed.data.type]} entry removed`, {
      type: parsed.data.type,
      id: parsed.data.id,
      entryDate: snapshot.entryDate ?? null,
    });
  } catch (error) {
    next(error);
  }
}