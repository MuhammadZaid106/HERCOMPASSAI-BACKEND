/**
 * Deterministic Baseline Score Engine
 * Directive: "Deterministic Software Calculates; AI Interprets"
 * Pure mathematical algorithms calculate numeric scores, indices, and pattern tags.
 */

export interface RawAssessmentInputs {
  primaryHealthConcerns?: string[];
  symptomImpact?: string | null;
  sleepQuality?: string | null;
  sleepChallenges?: string[];
  energyLevel?: string | null;
  activityLevel?: string | null;
  weeklyExerciseMinutes?: string | null;
  energyAfterMealRating?: number | null;
  moodBaseline?: Record<string, number>;
  moodOverall?: string | null;
  primaryGoals?: string[];
  primaryGoal?: string | null;
}

export interface CalculatedScores {
  [key: string]: unknown;
  symptomBurdenScore: number; // 0 - 100
  sleepDisturbanceScore: number; // 0 - 100
  vitalityIndex: number; // 0 - 100
  emotionalBalanceScore: number; // 0 - 100
  dominantFocusArea: string;
  calculatedAt: string;
}

export function calculateDeterministicScores(
  inputs: RawAssessmentInputs
): CalculatedScores {
  // 1. Symptom Burden Score (0 - 100)
  const concernsCount = inputs.primaryHealthConcerns?.length || 0;
  const impactMultiplierMap: Record<string, number> = {
    not_much: 1.0,
    a_little: 1.3,
    moderately: 1.7,
    a_lot: 2.1,
    extremely: 2.5,
    prefer_not_to_say: 1.4,
  };
  const multiplier = inputs.symptomImpact
    ? impactMultiplierMap[inputs.symptomImpact] || 1.4
    : 1.4;
  const rawBurden = Math.min(concernsCount * 4 * multiplier, 100);
  const symptomBurdenScore = Math.round(rawBurden);

  // 2. Sleep Disturbance Score (0 - 100)
  const sleepQualityScores: Record<string, number> = {
    very_good: 10,
    good: 25,
    mixed: 50,
    difficult: 75,
    very_difficult: 95,
    prefer_not_to_say: 45,
  };
  const baseSleepScore = inputs.sleepQuality
    ? sleepQualityScores[inputs.sleepQuality] || 40
    : 40;
  const challengesCount = inputs.sleepChallenges?.length || 0;
  const sleepDisturbanceScore = Math.min(
    Math.round(baseSleepScore + challengesCount * 5),
    100
  );

  // 3. Vitality Index (0 - 100)
  const activityScores: Record<string, number> = {
    sedentary: 30,
    light: 55,
    moderate: 75,
    very_active: 95,
  };
  const baseActivity = inputs.activityLevel
    ? activityScores[inputs.activityLevel] || 50
    : 50;

  const exerciseMinutesScores: Record<string, number> = {
    "0-30": 30,
    "30-60": 55,
    "60-90": 75,
    "90plus": 95,
  };
  const baseExercise = inputs.weeklyExerciseMinutes
    ? exerciseMinutesScores[inputs.weeklyExerciseMinutes] || 50
    : 50;

  const mealEnergy = (inputs.energyAfterMealRating || 2) * 30; // 30, 60, or 90
  const vitalityIndex = Math.round(
    baseActivity * 0.4 + baseExercise * 0.35 + mealEnergy * 0.25
  );

  // 4. Emotional Balance Score (0 - 100)
  const mb = inputs.moodBaseline || {};
  const positiveRating =
    (Number(mb.calm) || 3) + (Number(mb.happy) || 3) + (Number(mb.motivated) || 3);
  const negativeRating =
    (Number(mb.anxious) || 3) +
    (Number(mb.irritable) || 3) +
    (Number(mb.sad) || 3) +
    (Number(mb.tired) || 3);

  const netMood = positiveRating / 3 - negativeRating / 4;
  const emotionalBalanceScore = Math.min(
    Math.max(Math.round(50 + netMood * 12.5), 10),
    98
  );

  // 5. Deterministic Dominant Focus Area
  let dominantFocusArea = "Holistic Rhythm & Daily Baseline";
  if (inputs.primaryGoal) {
    dominantFocusArea = inputs.primaryGoal;
  } else if (sleepDisturbanceScore >= 60) {
    dominantFocusArea = "Restorative Sleep & Evening Wind-Down";
  } else if (symptomBurdenScore >= 60) {
    dominantFocusArea = "Vasomotor Comfort & Cooling Support";
  } else if (emotionalBalanceScore < 45) {
    dominantFocusArea = "Nervous System Regulation & Breathwork";
  } else if (vitalityIndex < 50) {
    dominantFocusArea = "Metabolic Energy & Low-Impact Movement";
  }

  return {
    symptomBurdenScore,
    sleepDisturbanceScore,
    vitalityIndex,
    emotionalBalanceScore,
    dominantFocusArea,
    calculatedAt: new Date().toISOString(),
  };
}
