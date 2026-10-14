import { Goal, type GoalCategory, type GoalStatus } from "../../models/Goal.js";
import { logger } from "../../utils/logger.js";

const goalLog = logger.module("GOAL_SERVICE");

export interface SyncOnboardingGoalsInput {
  primaryGoal?: string | null;
  primaryHealthConcerns?: string[];
  emotionalGoals?: string[];
  lifestyleFocus?: string[];
}

export async function syncGoalsFromOnboarding(
  userId: string,
  input: SyncOnboardingGoalsInput,
): Promise<Goal[]> {
  const existingGoals = await Goal.findAll({ where: { userId } });
  const existingTitles = new Set(existingGoals.map((g) => g.title.toLowerCase().trim()));
  const newGoals: Array<{ userId: string; category: GoalCategory; title: string; metadata?: Record<string, unknown> }> = [];

  if (input.primaryGoal && input.primaryGoal.trim()) {
    const title = input.primaryGoal.trim();
    if (!existingTitles.has(title.toLowerCase())) {
      newGoals.push({
        userId,
        category: "health",
        title,
        metadata: { isPrimary: true, source: "onboarding" },
      });
      existingTitles.add(title.toLowerCase());
    }
  }

  for (const concern of input.primaryHealthConcerns || []) {
    const title = concern.trim();
    if (title && !existingTitles.has(title.toLowerCase())) {
      newGoals.push({
        userId,
        category: "health",
        title: `Address ${title}`,
        metadata: { source: "primary_health_concern" },
      });
      existingTitles.add(title.toLowerCase());
    }
  }

  for (const emGoal of input.emotionalGoals || []) {
    const title = emGoal.trim();
    if (title && !existingTitles.has(title.toLowerCase())) {
      newGoals.push({
        userId,
        category: "emotional",
        title,
        metadata: { source: "emotional_goals" },
      });
      existingTitles.add(title.toLowerCase());
    }
  }

  for (const lifeGoal of input.lifestyleFocus || []) {
    const title = lifeGoal.trim();
    if (title && !existingTitles.has(title.toLowerCase())) {
      newGoals.push({
        userId,
        category: "lifestyle",
        title,
        metadata: { source: "lifestyle_focus" },
      });
      existingTitles.add(title.toLowerCase());
    }
  }

  if (newGoals.length > 0) {
    const created = await Goal.bulkCreate(newGoals);
    goalLog.info(`Synced ${created.length} goals for user ${userId} from onboarding`);
  }

  return Goal.findAll({ where: { userId }, order: [["createdAt", "ASC"]] });
}

export async function listUserGoals(userId: string): Promise<Goal[]> {
  return Goal.findAll({
    where: { userId, status: "active" },
    order: [["createdAt", "ASC"]],
  });
}

export async function createGoal(
  userId: string,
  category: GoalCategory,
  title: string,
  targetDate?: Date | null,
): Promise<Goal> {
  return Goal.create({
    userId,
    category,
    title: title.trim(),
    targetDate: targetDate ?? null,
    status: "active",
  });
}

export async function updateGoalStatus(
  userId: string,
  goalId: string,
  status: GoalStatus,
): Promise<Goal | null> {
  const goal = await Goal.findOne({ where: { id: goalId, userId } });
  if (!goal) return null;
  await goal.update({ status });
  return goal;
}
