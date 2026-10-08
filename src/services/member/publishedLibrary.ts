import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { ContentPiece } from "../../models/ContentPiece.js";
import {
  MEDITATION_CATALOG,
  type MeditationSession,
} from "./meditationCatalog.js";
import { RECIPE_CATALOG, type RecipeRecord } from "./recipeCatalog.js";
import { WORKOUT_CATALOG, type WorkoutRecord } from "./workoutCatalog.js";

const libraryLog = logger.module("CONTENT");

const recipeBody = z.object({
  why: z.string(),
  ingredients: z.array(z.string()),
  nutrition: z.string(),
  focusHints: z.array(z.string()),
});

const workoutBody = z.object({
  focus: z.string(),
  difficulty: z.string(),
  why: z.string(),
  focusHints: z.array(z.string()),
});

const meditationBody = z.object({
  focus: z.string(),
  minutes: z.number(),
  tier: z.enum(["free", "plus"]),
  focusHints: z.array(z.string()),
  why: z.string(),
  steps: z.array(z.string()),
});

export const contentWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe"),
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    body: recipeBody,
  }),
  z.object({
    kind: z.literal("workout"),
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    body: workoutBody,
  }),
  z.object({
    kind: z.literal("meditation"),
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    body: meditationBody,
  }),
]);

async function tableIsInUse(): Promise<boolean> {
  const total = await ContentPiece.count();
  return total > 0;
}

export async function recipeLibrary(): Promise<RecipeRecord[]> {
  try {
    if (!(await tableIsInUse())) return RECIPE_CATALOG;
    const rows = await ContentPiece.findAll({ where: { kind: "recipe", status: "published" } });
    return rows.flatMap((row) => {
      const parsed = recipeBody.safeParse(row.body);
      if (!parsed.success) return [];
      return [{ slug: row.slug, title: row.title, ...parsed.data }];
    });
  } catch (error) {
    libraryLog.warn("Recipe library fell back to the code list", error);
    return RECIPE_CATALOG;
  }
}

export async function workoutLibrary(): Promise<WorkoutRecord[]> {
  try {
    if (!(await tableIsInUse())) return WORKOUT_CATALOG;
    const rows = await ContentPiece.findAll({ where: { kind: "workout", status: "published" } });
    return rows.flatMap((row) => {
      const parsed = workoutBody.safeParse(row.body);
      if (!parsed.success) return [];
      return [{ slug: row.slug, title: row.title, ...parsed.data }];
    });
  } catch (error) {
    libraryLog.warn("Workout library fell back to the code list", error);
    return WORKOUT_CATALOG;
  }
}

export async function meditationLibrary(): Promise<MeditationSession[]> {
  try {
    if (!(await tableIsInUse())) return MEDITATION_CATALOG;
    const rows = await ContentPiece.findAll({ where: { kind: "meditation", status: "published" } });
    return rows.flatMap((row) => {
      const parsed = meditationBody.safeParse(row.body);
      if (!parsed.success) return [];
      return [{ slug: row.slug, title: row.title, ...parsed.data }];
    });
  } catch (error) {
    libraryLog.warn("Meditation library fell back to the code list", error);
    return MEDITATION_CATALOG;
  }
}
