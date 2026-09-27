import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");
const noteSchema = z.string().max(1000).nullable().optional();

export const symptomEntrySchema = z.object({
  entryDate: dateSchema,
  symptoms: z.array(z.string().min(1).max(100)).max(30),
  impactLevel: z.enum(["not_at_all", "a_little", "somewhat", "a_lot"]),
  intensity: z.number().int().min(1).max(5).nullable().optional(),
  note: noteSchema,
});

export const moodEntrySchema = z.object({
  entryDate: dateSchema,
  moodLevel: z.number().int().min(1).max(5),
  moodTags: z.array(z.string().min(1).max(100)).max(20).default([]),
  note: noteSchema,
});

export const sleepEntrySchema = z.object({
  entryDate: dateSchema,
  quality: z.enum(["poor", "fair", "good", "very_good"]),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  wakeCount: z.number().int().min(0).max(50).nullable().optional(),
  sleepChallenges: z.array(z.string().min(1).max(100)).max(20).default([]),
  note: noteSchema,
});

export const energyEntrySchema = z.object({
  entryDate: dateSchema,
  energyLevel: z.number().int().min(1).max(5),
  energyPattern: z.enum([
    "morning",
    "afternoon",
    "evening",
    "throughout_the_day",
    "varies",
  ]),
  note: noteSchema,
});

export const lifestyleEntrySchema = z.object({
  entryDate: dateSchema,
  movementLevel: z.number().int().min(1).max(5).nullable().optional(),
  nutritionRating: z.number().int().min(1).max(5).nullable().optional(),
  hydrationRating: z.number().int().min(1).max(5).nullable().optional(),
  stressLevel: z.number().int().min(1).max(5).nullable().optional(),
  relaxationCompleted: z.boolean().default(false),
  socialConnection: z.number().int().min(1).max(5).nullable().optional(),
  routineConsistency: z.number().int().min(1).max(5).nullable().optional(),
  note: noteSchema,
});

export const trackingQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("7d"),
});

export type SymptomEntryPayload = z.infer<typeof symptomEntrySchema>;
export type MoodEntryPayload = z.infer<typeof moodEntrySchema>;
export type SleepEntryPayload = z.infer<typeof sleepEntrySchema>;
export type EnergyEntryPayload = z.infer<typeof energyEntrySchema>;
export type LifestyleEntryPayload = z.infer<typeof lifestyleEntrySchema>;
