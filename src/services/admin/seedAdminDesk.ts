import { logger } from "../../utils/logger.js";
import {
  AppSetting,
  BetaCohort,
  ContentPiece,
  EvaluationCase,
} from "../../models/index.js";
import { MEDITATION_CATALOG } from "../member/meditationCatalog.js";
import { RECIPE_CATALOG } from "../member/recipeCatalog.js";
import { WORKOUT_CATALOG } from "../member/workoutCatalog.js";
import { ACADEMY_LESSONS } from "../partner/academyCatalog.js";
import { FOUNDING_CAP_KEY } from "./adminProductConfig.js";
import { GOLD_CASE_SEED } from "./adminEvaluation.js";

const seedLog = logger.module("ADMIN");

const COHORTS = [
  { slug: "founding-women", name: "Founding Women" },
  { slug: "workplace", name: "Workplace" },
  { slug: "professional", name: "Professional" },
  { slug: "couples", name: "Couples" },
] as const;

/** Creates empty cohorts, the founding cap, and the first published library. */
export async function seedAdminDesk(): Promise<void> {
  const cohortCount = await BetaCohort.count();
  if (cohortCount === 0) {
    await BetaCohort.bulkCreate(COHORTS.map((cohort) => ({ ...cohort })));
    seedLog.info("Admin beta groups created empty");
  }

  const cap = await AppSetting.findByPk(FOUNDING_CAP_KEY);
  if (!cap) {
    await AppSetting.create({ key: FOUNDING_CAP_KEY, value: "100" });
    seedLog.info("Founding cohort cap set to 100");
  }

  const caseCount = await EvaluationCase.count();
  if (caseCount === 0) {
    await EvaluationCase.bulkCreate(GOLD_CASE_SEED);
    seedLog.info(`Seeded ${GOLD_CASE_SEED.length} evaluation gold cases`);
  }

  const pieceCount = await ContentPiece.count();
  if (pieceCount > 0) {
    const academyCount = await ContentPiece.count({ where: { kind: "mens_academy" } });
    if (academyCount === 0) {
      await ContentPiece.bulkCreate(
        ACADEMY_LESSONS.map((item) => ({
          kind: "mens_academy" as const,
          slug: item.slug,
          title: item.title,
          status: "published" as const,
          body: {
            category: item.category,
            version: item.version,
            evidenceId: item.evidenceId,
            summary: item.summary,
            paragraphs: item.paragraphs,
          },
        })),
      );
      seedLog.info("Men's Academy lessons copied into the content desk");
    }
    return;
  }

  await ContentPiece.bulkCreate([
    ...RECIPE_CATALOG.map((item) => ({
      kind: "recipe" as const,
      slug: item.slug,
      title: item.title,
      status: "published" as const,
      body: {
        why: item.why,
        ingredients: item.ingredients,
        nutrition: item.nutrition,
        focusHints: item.focusHints,
      },
    })),
    ...WORKOUT_CATALOG.map((item) => ({
      kind: "workout" as const,
      slug: item.slug,
      title: item.title,
      status: "published" as const,
      body: {
        focus: item.focus,
        difficulty: item.difficulty,
        why: item.why,
        focusHints: item.focusHints,
      },
    })),
    ...MEDITATION_CATALOG.map((item) => ({
      kind: "meditation" as const,
      slug: item.slug,
      title: item.title,
      status: "published" as const,
      body: {
        focus: item.focus,
        minutes: item.minutes,
        tier: item.tier,
        focusHints: item.focusHints,
        why: item.why,
        steps: item.steps,
      },
    })),
    ...ACADEMY_LESSONS.map((item) => ({
      kind: "mens_academy" as const,
      slug: item.slug,
      title: item.title,
      status: "published" as const,
      body: {
        category: item.category,
        version: item.version,
        evidenceId: item.evidenceId,
        summary: item.summary,
        paragraphs: item.paragraphs,
      },
    })),
  ]);
  seedLog.info("Member library and Men's Academy copied into the content desk as published");
}
