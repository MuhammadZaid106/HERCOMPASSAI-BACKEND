import { z } from "zod";

export const onboardingPayloadSchema = z.object({
  version: z.string().optional().default("1.0"),
  isCompleted: z.boolean().optional().default(true),
  consentAccepted: z.literal(true),
  consentVersion: z.string().min(1).max(20),
  consentType: z.literal("wellness_personalization"),

  // Demographics & Stage
  age: z
    .number()
    .int()
    .min(18, "Age must be at least 18")
    .max(120, "Please enter a valid age")
    .nullable()
    .optional(),
  menopausePhase: z
    .enum(["perimenopause", "menopause", "postmenopause", "unsure"])
    .nullable()
    .optional(),
  hormoneTherapyStatus: z
    .enum(["yes", "no", "considering"])
    .nullable()
    .optional(),

  // Primary Goals & Symptoms
  primaryGoals: z.array(z.string()).optional().default([]),
  primaryHealthConcerns: z.array(z.string()).optional().default([]),
  symptomImpact: z
    .enum([
      "not_much",
      "a_little",
      "moderately",
      "a_lot",
      "extremely",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  medicalConditions: z.string().max(1000).nullable().optional(),

  // Mood & Emotions Baseline
  moodBaseline: z.record(z.string(), z.number().min(1).max(5)).optional().default({}),
  moodOverall: z
    .enum([
      "doing_well",
      "mostly_okay",
      "some_challenges",
      "significant_challenges",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  moodPatterns: z.array(z.string()).optional().default([]),
  emotionalGoals: z.array(z.string()).optional().default([]),
  meditationFrequency: z
    .enum(["daily", "weekly", "rarely", "never"])
    .nullable()
    .optional(),

  // Sleep
  sleepQuality: z
    .enum([
      "very_good",
      "good",
      "mixed",
      "difficult",
      "very_difficult",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  sleepChallenges: z.array(z.string()).optional().default([]),

  // Energy & Nutrition
  energyLevel: z
    .enum([
      "high",
      "good",
      "up_and_down",
      "often_low",
      "very_low",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  energyPattern: z
    .enum([
      "morning",
      "afternoon",
      "evening",
      "throughout_the_day",
      "varies",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  dietaryPreferences: z.array(z.string()).optional().default([]),
  allergies: z.string().max(500).nullable().optional(),
  energyAfterMealRating: z.number().int().min(1).max(3).nullable().optional(),

  // Movement & Activity
  activityLevel: z
    .enum(["sedentary", "light", "moderate", "very_active"])
    .nullable()
    .optional(),
  exercisePreferences: z.array(z.string()).optional().default([]),
  weeklyExerciseMinutes: z
    .enum(["0-30", "30-60", "60-90", "90plus"])
    .nullable()
    .optional(),
  lifestyleFocus: z.array(z.string()).optional().default([]),

  // Signature Priority Goal
  primaryGoal: z.string().max(255).nullable().optional(),

  // AI Guidance Preferences
  dailyCheckinOptIn: z.boolean().optional().default(true),
  preferredRecommendations: z.array(z.string()).optional().default([]),

  // Couple & Partner Support (CPS) Scoped Consent
  partnerSupportInterest: z
    .enum([
      "yes",
      "maybe",
      "not_now",
      "not_interested",
      "no_partner",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
  partnerSupportNeeds: z.array(z.string()).optional().default([]),
  partnerEmail: z
    .string()
    .email("Please provide a valid partner email address")
    .nullable()
    .or(z.literal(""))
    .optional(),
  partnerConsent: z.boolean().optional().default(false),
  partnerSharingScopes: z.array(z.string()).optional().default([
    "digest_summary",
    "communication_guidance",
    "shared_activities",
  ]),
});

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
