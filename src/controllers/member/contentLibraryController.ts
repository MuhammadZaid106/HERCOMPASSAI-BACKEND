import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { OnboardingProfile, SavedContent } from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { type RecipeRecord } from "../../services/member/recipeCatalog.js";
import { type WorkoutRecord } from "../../services/member/workoutCatalog.js";
import { recipeLibrary, workoutLibrary } from "../../services/member/publishedLibrary.js";

const recipeSaveSchema = z.object({
  saved: z.boolean(),
  onPlan: z.boolean(),
});

const workoutSaveSchema = z.object({
  saved: z.boolean(),
  started: z.boolean(),
});

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (req.user.role !== "member") {
    sendError(res, 403, "This library is for member accounts");
    return null;
  }
  return req.user.userId;
}

function rankByFocus<T extends { focusHints: string[] }>(items: T[], focusText: string): T[] {
  const focus = focusText.toLowerCase();
  return [...items].sort((left, right) => {
    const leftHit = left.focusHints.some((hint) => focus.includes(hint)) ? 1 : 0;
    const rightHit = right.focusHints.some((hint) => focus.includes(hint)) ? 1 : 0;
    return rightHit - leftHit;
  });
}

async function focusText(userId: string): Promise<string> {
  const profile = await OnboardingProfile.findOne({ where: { userId } });
  const concerns = profile?.primaryHealthConcerns ?? [];
  return concerns.join(" ");
}

async function savedRow(userId: string, kind: "recipe" | "workout", slug: string) {
  return SavedContent.findOne({ where: { userId, kind, slug } });
}

function publicRecipe(item: RecipeRecord, row: SavedContent | null) {
  return {
    slug: item.slug,
    title: item.title,
    why: item.why,
    ingredients: item.ingredients,
    nutrition: item.nutrition,
    saved: Boolean(row?.saved),
    onPlan: Boolean(row?.onPlan),
  };
}

function publicWorkout(item: WorkoutRecord, row: SavedContent | null) {
  return {
    slug: item.slug,
    title: item.title,
    focus: item.focus,
    difficulty: item.difficulty,
    why: item.why,
    saved: Boolean(row?.saved),
    started: Boolean(row?.started),
  };
}

export async function listRecipes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const ordered = rankByFocus(await recipeLibrary(), await focusText(userId));
    const rows = await SavedContent.findAll({ where: { userId, kind: "recipe" } });
    sendSuccess(res, 200, "Recipes", {
      items: ordered.map((item) => publicRecipe(item, rows.find((row) => row.slug === item.slug) ?? null)),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecipe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const item = (await recipeLibrary()).find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This recipe is not in the library");
      return;
    }
    const row = await savedRow(userId, "recipe", item.slug);
    sendSuccess(res, 200, "Recipe", publicRecipe(item, row));
  } catch (error) {
    next(error);
  }
}

export async function saveRecipe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const item = (await recipeLibrary()).find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This recipe is not in the library");
      return;
    }
    const parsed = recipeSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Choose whether to save this recipe");
      return;
    }
    const [row] = await SavedContent.findOrCreate({
      where: { userId, kind: "recipe", slug: item.slug },
      defaults: { userId, kind: "recipe", slug: item.slug },
    });
    await row.update({ saved: parsed.data.saved, onPlan: parsed.data.onPlan });
    sendSuccess(res, 200, "Recipe updated", publicRecipe(item, row));
  } catch (error) {
    next(error);
  }
}

export async function listWorkouts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const ordered = rankByFocus(await workoutLibrary(), await focusText(userId));
    const rows = await SavedContent.findAll({ where: { userId, kind: "workout" } });
    sendSuccess(res, 200, "Workouts", {
      items: ordered.map((item) => publicWorkout(item, rows.find((row) => row.slug === item.slug) ?? null)),
    });
  } catch (error) {
    next(error);
  }
}

export async function getWorkout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const item = (await workoutLibrary()).find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This session is not in the library");
      return;
    }
    const row = await savedRow(userId, "workout", item.slug);
    sendSuccess(res, 200, "Workout", publicWorkout(item, row));
  } catch (error) {
    next(error);
  }
}

export async function saveWorkout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const item = (await workoutLibrary()).find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This session is not in the library");
      return;
    }
    const parsed = workoutSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Choose whether to save this session");
      return;
    }
    const [row] = await SavedContent.findOrCreate({
      where: { userId, kind: "workout", slug: item.slug },
      defaults: { userId, kind: "workout", slug: item.slug },
    });
    await row.update({ saved: parsed.data.saved, started: parsed.data.started });
    sendSuccess(res, 200, "Session updated", publicWorkout(item, row));
  } catch (error) {
    next(error);
  }
}
