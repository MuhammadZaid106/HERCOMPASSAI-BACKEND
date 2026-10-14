import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { ContentPiece } from "../../models/ContentPiece.js";
import {
  MEDITATION_CATALOG,
  type MeditationSession,
} from "./meditationCatalog.js";
import {
  RECIPE_CATALOG,
  type RecipeEvidence,
  type RecipeMacros,
  type RecipeRecord,
} from "./recipeCatalog.js";
import {
  WORKOUT_CATALOG,
  type WorkoutEvidence,
  type WorkoutExercise,
  type WorkoutRecord,
} from "./workoutCatalog.js";
import { EXPLORE_CATALOG, type ExploreRecord } from "./exploreCatalog.js";

const libraryLog = logger.module("CONTENT");

const recipeEvidence = z.object({
  source: z.string(),
  note: z.string(),
});

const recipeBody = z.object({
  why: z.string(),
  ingredients: z.array(z.string()),
  nutrition: z.string(),
  focusHints: z.array(z.string()),
  category: z.enum(["breakfast", "lunch", "dinner", "snacks"]).optional(),
  prepMinutes: z.number().int().positive().max(180).optional(),
  servings: z.number().int().positive().max(24).optional(),
  difficulty: z.enum(["Simple", "Easy", "Medium"]).optional(),
  instructions: z.array(z.string()).optional(),
  macroSummary: z
    .object({
      proteinG: z.number(),
      carbsG: z.number(),
      fatG: z.number(),
      caloriesKcal: z.number(),
    })
    .optional(),
  tier: z.enum(["free", "plus"]).optional(),
  evidence: z.array(recipeEvidence).optional(),
});

const workoutExercise = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(500),
  reps: z.string().trim().min(1).max(80),
  seconds: z.number().int().positive().max(1800).optional(),
});

const workoutBody = z.object({
  focus: z.string(),
  difficulty: z.string(),
  why: z.string(),
  focusHints: z.array(z.string()),
  category: z
    .enum(["low-impact", "flexibility", "strength", "cardio", "breathing"])
    .optional(),
  durationMinutes: z.number().int().positive().max(180).optional(),
  focusAreas: z.array(z.string()).optional(),
  tier: z.enum(["free", "plus"]).optional(),
  exercises: z.array(workoutExercise).optional(),
  evidence: z.array(recipeEvidence).optional(),
});

const meditationBody = z.object({
  focus: z.string(),
  minutes: z.number(),
  tier: z.enum(["free", "plus"]),
  focusHints: z.array(z.string()),
  why: z.string(),
  steps: z.array(z.string()),
});

const slugField = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const titleField = z.string().trim().min(1).max(120);

const proseBody = z.object({
  summary: z.string().trim().min(1).max(500),
  paragraphs: z.array(z.string().trim().min(1)).min(1).max(20),
});

const academyBody = z.object({
  category: z.enum(["basics", "daily-life", "relationship", "workplace", "sleep-intimacy"]),
  version: z.string().trim().min(1).max(16),
  evidenceId: z.string().trim().min(1).max(64),
  summary: z.string().trim().min(1).max(500),
  paragraphs: z.array(z.string().trim().min(1)).min(1).max(20),
  trackNumber: z.string().trim().max(8).optional(),
  duration: z.string().trim().max(16).optional(),
  takeaway: z.string().trim().max(500).optional(),
  listenContext: z.string().trim().max(200).optional(),
  audioUrl: z.string().trim().url().optional(),
});

const evidenceExplanationBody = z.object({
  evidenceIds: z.array(z.string().trim().min(1)).min(1).max(12),
  summary: z.string().trim().min(1).max(500),
  paragraphs: z.array(z.string().trim().min(1)).min(1).max(20),
});

const exploreEvidenceItem = z.object({
  source: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(500),
});

const exploreBody = z.object({
  category: z.enum(["sleep", "mood", "energy", "nutrition", "movement", "stress", "relationships", "menopause", "partner-support", "mens-academy", "evidence"]),
  minutes: z.number().int().min(1).max(60),
  why: z.string().trim().min(1).max(1000),
  tryThis: z.string().trim().min(1).max(500),
  tryHref: z.string().trim().min(1).max(200),
  tryLabel: z.string().trim().min(1).max(80),
  evidence: z.array(exploreEvidenceItem).min(1).max(10),
  starter: z.boolean(),
});

export const contentWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe"),
    title: titleField,
    slug: slugField,
    body: recipeBody,
  }),
  z.object({
    kind: z.literal("workout"),
    title: titleField,
    slug: slugField,
    body: workoutBody,
  }),
  z.object({
    kind: z.literal("meditation"),
    title: titleField,
    slug: slugField,
    body: meditationBody,
  }),
  z.object({
    kind: z.literal("article"),
    title: titleField,
    slug: slugField,
    body: proseBody,
  }),
  z.object({
    kind: z.literal("mens_academy"),
    title: titleField,
    slug: slugField,
    body: academyBody,
  }),
  z.object({
    kind: z.literal("partner_content"),
    title: titleField,
    slug: slugField,
    body: proseBody,
  }),
  z.object({
    kind: z.literal("partner_activity"),
    title: titleField,
    slug: slugField,
    body: z.object({
      label: z.string().trim().min(1).max(80),
      suggestion: z.string().trim().min(1).max(500),
      evidenceId: z.string().trim().min(1).max(64),
    }),
  }),
  z.object({
    kind: z.literal("couple_challenge"),
    title: titleField,
    slug: slugField,
    body: z.object({
      category: z.string().trim().min(1).max(80),
      description: z.string().trim().min(1).max(500),
      benefit: z.string().trim().min(1).max(500),
    }),
  }),
  z.object({
    kind: z.literal("evidence_explanation"),
    title: titleField,
    slug: slugField,
    body: evidenceExplanationBody,
  }),
  z.object({
    kind: z.literal("educational"),
    title: titleField,
    slug: slugField,
    body: proseBody,
  }),
  z.object({
    kind: z.literal("explore"),
    title: titleField,
    slug: slugField,
    body: exploreBody,
  }),
]);

/**
 * Display helpers the API can serialize even when an admin-created row predates
 * the richer card fields. They only derive labels and layout defaults — never
 * clinical numbers — and macro/exercise detail is dropped rather than invented.
 */

function categoryFromTitle(title: string, fallback: RecipeRecord["category"]): RecipeRecord["category"] {
  const text = title.toLowerCase();
  if (text.includes("lunch")) return "lunch";
  if (text.includes("snack")) return "snacks";
  if (text.includes("evening") || text.includes("dinner")) return "dinner";
  return fallback;
}

function minutesFromTitle(title: string, fallback: number): number {
  const match = title.match(/(\d{1,3})[\s-]?min/i);
  return match ? Math.min(Number(match[1]), 180) : fallback;
}

function recipePresentation(
  title: string,
  body: z.infer<typeof recipeBody>,
): Pick<
  RecipeRecord,
  | "category"
  | "prepMinutes"
  | "servings"
  | "difficulty"
  | "instructions"
  | "macroSummary"
  | "tier"
  | "evidence"
> {
  const instructions = body.instructions ?? body.why.split(/[.;]+/).map((part) => part.trim()).filter(Boolean);
  const evidence: RecipeEvidence[] =
    body.evidence ?? [
      {
        source: "NAMS",
        note: "Educational context for this food idea. Not a diagnosis or a prescribed diet.",
      },
    ];
  return {
    category:
      body.category ??
      (title.toLowerCase().includes("breakfast") ? "breakfast" : categoryFromTitle(title, "dinner")),
    prepMinutes: body.prepMinutes ?? 20,
    servings: body.servings ?? 2,
    difficulty: body.difficulty ?? "Easy",
    instructions: instructions.length > 0 ? instructions : ["Prepare the ingredients and cook to your taste."],
    macroSummary: (body.macroSummary as RecipeMacros | null | undefined) ?? null,
    tier: body.tier ?? "free",
    evidence,
  };
}

function workoutPresentation(
  title: string,
  body: z.infer<typeof workoutBody>,
): Pick<
  WorkoutRecord,
  "category" | "durationMinutes" | "focusAreas" | "tier" | "exercises" | "evidence"
> {
  const text = title.toLowerCase();
  const category: WorkoutRecord["category"] =
    body.category ??
    (text.includes("stretch") || text.includes("flex")
      ? "flexibility"
      : text.includes("cardio") || text.includes("walk")
        ? "cardio"
        : "low-impact");
  const exercises: WorkoutExercise[] =
    body.exercises ??
    [
      {
        title: "Gentle movement",
        detail: body.why,
        reps: `${body.durationMinutes ?? 20} minutes`,
        seconds: (body.durationMinutes ?? 20) * 60,
      },
    ];
  const evidence: WorkoutEvidence[] =
    body.evidence ?? [
      {
        source: "WHO",
        note: "Public activity guidance for adults. Choose what feels workable for you.",
      },
    ];
  return {
    category,
    durationMinutes: body.durationMinutes ?? minutesFromTitle(title, 15),
    focusAreas: body.focusAreas ?? [body.focus],
    tier: body.tier ?? "free",
    exercises,
    evidence,
  };
}

async function tableIsInUse(): Promise<boolean> {
  const total = await ContentPiece.count();
  return total > 0;
}

export async function recipeLibrary(): Promise<RecipeRecord[]> {
  try {
    const rows = await ContentPiece.findAll({ where: { kind: "recipe", status: "published" } });
    const parsed = rows.flatMap((row) => {
      const match = recipeBody.safeParse(row.body);
      if (!match.success) return [];
      return [{ slug: row.slug, title: row.title, ...match.data, ...recipePresentation(row.title, match.data) }];
    });
    return parsed.length > 0 ? parsed : RECIPE_CATALOG;
  } catch (error) {
    libraryLog.warn("Recipe library fell back to the code list", error);
    return RECIPE_CATALOG;
  }
}

export async function workoutLibrary(): Promise<WorkoutRecord[]> {
  try {
    const rows = await ContentPiece.findAll({ where: { kind: "workout", status: "published" } });
    const parsed = rows.flatMap((row) => {
      const match = workoutBody.safeParse(row.body);
      if (!match.success) return [];
      return [{ slug: row.slug, title: row.title, ...match.data, ...workoutPresentation(row.title, match.data) }];
    });
    return parsed.length > 0 ? parsed : WORKOUT_CATALOG;
  } catch (error) {
    libraryLog.warn("Workout library fell back to the code list", error);
    return WORKOUT_CATALOG;
  }
}

export async function meditationLibrary(): Promise<MeditationSession[]> {
  try {
    const rows = await ContentPiece.findAll({ where: { kind: "meditation", status: "published" } });
    if (rows.length === 0) return MEDITATION_CATALOG;
    const parsed = rows.flatMap((row) => {
      const match = meditationBody.safeParse(row.body);
      if (!match.success) return [];
      return [{ slug: row.slug, title: row.title, ...match.data }];
    });
    return parsed.length > 0 ? parsed : MEDITATION_CATALOG;
  } catch (error) {
    libraryLog.warn("Meditation library fell back to the code list", error);
    return MEDITATION_CATALOG;
  }
}

export async function exploreLibrary(): Promise<ExploreRecord[]> {
  try {
    const rows = await ContentPiece.findAll({ where: { kind: "explore", status: "published" } });
    if (rows.length === 0) return EXPLORE_CATALOG;
    return rows.flatMap((row) => {
      const parsed = exploreBody.safeParse(row.body);
      if (!parsed.success) return [];
      return [{ slug: row.slug, title: row.title, ...parsed.data }];
    });
  } catch (error) {
    libraryLog.warn("Explore library fell back to the code list", error);
    return EXPLORE_CATALOG;
  }
}
