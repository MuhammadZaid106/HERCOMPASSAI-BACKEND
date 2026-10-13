import { ContentPiece } from "../../models/index.js";
import { logger } from "../../utils/logger.js";

export interface ActivitySuggestion {
  key: string;
  label: string;
  suggestion: string;
  evidenceId: string;
}

export interface CoupleChallenge {
  id: string;
  title: string;
  category: string;
  description: string;
  benefit: string;
}

/** Fallback: seven shared-activity names from the partner screens. Suggestions only. */
export const ACTIVITY_SUGGESTIONS: ActivitySuggestion[] = [
  {
    key: "walk_together",
    label: "Walk together",
    suggestion: "A short walk side by side is one way to spend time together without turning it into a task.",
    evidenceId: "ev-nams-001",
  },
  {
    key: "relaxation",
    label: "Relaxation",
    suggestion: "A few quiet minutes together can be enough. Keep it optional.",
    evidenceId: "ev-mbsr-011",
  },
  {
    key: "meal_preparation",
    label: "Meal preparation",
    suggestion: "Preparing a simple meal together is a practical way to share the evening.",
    evidenceId: "ev-usda-007",
  },
  {
    key: "conversation",
    label: "Conversation",
    suggestion: "Ask what would be welcome today, then follow that answer.",
    evidenceId: "ev-act-012",
  },
  {
    key: "sleep_routine",
    label: "Sleep routine",
    suggestion: "A calmer wind-down, such as dimmer lights, is a shared routine. It does not promise better sleep.",
    evidenceId: "ev-nams-001",
  },
  {
    key: "fun_activity",
    label: "Fun activity",
    suggestion: "Choose something light you both already enjoy. Keep the plan easy to change.",
    evidenceId: "ev-cbt-010",
  },
  {
    key: "connection",
    label: "Connection",
    suggestion: "A small check-in, without advice, is a way to stay close.",
    evidenceId: "ev-act-012",
  },
];

/** Fallback: four couple co-regulation challenges. */
export const COUPLE_CHALLENGES: CoupleChallenge[] = [
  {
    id: "cooling",
    title: "The 67°F Pre-Sleep Cooling Protocol",
    category: "Sleep Harmony",
    description: "Partner pre-sets bedroom cooling to 66°F–68°F 45 minutes before bedtime and prepares an extra light cotton layer.",
    benefit: "Reduces 3:00 AM awakenings and prevents middle-of-the-night thermostat battles.",
  },
  {
    id: "firewall",
    title: "The 8:30 PM Friction Firewall",
    category: "Communication",
    description: "A shared pact: zero high-stakes conversations regarding family budgets, in-laws, or scheduling after 8:30 PM.",
    benefit: "Protects evening autonomic calm and prevents sleep-destroying cortisol spikes.",
  },
  {
    id: "chore",
    title: "Silent Dinner & Chore Offloading",
    category: "Household Support",
    description: "Partner takes total ownership of dinner preparation and cleanup on two designated high-fatigue evenings without asking.",
    benefit: "Removes executive decision fatigue for the woman after a long workday.",
  },
  {
    id: "breathing",
    title: "Co-Regulated Box Breathing (4-4-4-4)",
    category: "Nervous System",
    description: "When emotional tension is sensed, sit quietly together for 2 minutes and synchronize four slow breath cycles.",
    benefit: "Down-regulates the sympathetic nervous system and signals physical safety.",
  },
];

const catalogLog = logger.module("PARTNER_CATALOG");

/**
 * Returns partner shared activities.
 * DB-first (kind: "partner_activity"): if no published rows exist, falls back to ACTIVITY_SUGGESTIONS.
 */
export async function listActivities(): Promise<ActivitySuggestion[]> {
  try {
    const rows = await ContentPiece.findAll({
      where: { kind: "partner_activity", status: "published" },
      order: [["slug", "ASC"]],
    });
    if (rows.length === 0) return ACTIVITY_SUGGESTIONS;
    return rows.flatMap((row) => {
      const body = row.body as Record<string, unknown>;
      if (typeof body.label !== "string" || typeof body.suggestion !== "string" || typeof body.evidenceId !== "string") return [];
      return [{
        key: row.slug,
        label: body.label,
        suggestion: body.suggestion,
        evidenceId: body.evidenceId,
      }];
    });
  } catch (error) {
    catalogLog.warn("Partner activity catalog fell back to code list", error);
    return ACTIVITY_SUGGESTIONS;
  }
}

/**
 * Returns couple co-regulation challenges.
 * DB-first (kind: "couple_challenge"): if no published rows exist, falls back to COUPLE_CHALLENGES.
 */
export async function listChallenges(): Promise<CoupleChallenge[]> {
  try {
    const rows = await ContentPiece.findAll({
      where: { kind: "couple_challenge", status: "published" },
      order: [["slug", "ASC"]],
    });
    if (rows.length === 0) return COUPLE_CHALLENGES;
    return rows.flatMap((row) => {
      const body = row.body as Record<string, unknown>;
      if (typeof body.category !== "string" || typeof body.description !== "string" || typeof body.benefit !== "string") return [];
      return [{
        id: row.slug,
        title: row.title,
        category: body.category,
        description: body.description,
        benefit: body.benefit,
      }];
    });
  } catch (error) {
    catalogLog.warn("Couple challenge catalog fell back to code list", error);
    return COUPLE_CHALLENGES;
  }
}
