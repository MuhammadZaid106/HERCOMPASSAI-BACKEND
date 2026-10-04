import { z } from "zod";

/**
 * Structured output contracts.
 *
 * The model returns only the narrative payload. Confidence, verified citations,
 * safety status and the safety notice are owned by the Gateway and are therefore
 * NOT part of the model schema — the model cannot assert them.
 */

const trimmedText = z.string().trim().min(1).max(1200);

const patternBlockSchema = z.object({
  summary: trimmedText.max(600),
  reportedAreas: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  impact: z.string().trim().max(40).nullable().default(null),
});

const recommendationSchema = z.object({
  what: trimmedText.max(400),
  why: trimmedText.max(400),
  start: trimmedText.max(300),
  category: z.string().trim().min(1).max(80),
  citationIds: z.array(z.string().trim().min(1).max(64)).max(6).default([]),
});

const nextStepSchema = z.object({
  horizon: z.enum(["today", "this_week", "track"]),
  action: trimmedText.max(300),
});

const partnerSupportSchema = z.object({
  suggestedApproach: trimmedText.max(400),
  shareIdea: trimmedText.max(300),
  citationIds: z.array(z.string().trim().min(1).max(64)).max(6).default([]),
});

/** Raw model payload for the Personal Menopause Snapshot™ (8-part contract). */
export const personalSnapshotModelOutputSchema = z.object({
  symptomPattern: patternBlockSchema,
  moodPattern: patternBlockSchema,
  sleepPattern: patternBlockSchema,
  energyPattern: patternBlockSchema,
  lifestyleObservations: z.array(trimmedText.max(400)).max(8).default([]),
  personalizedRecommendations: z
    .array(recommendationSchema)
    .min(1, "At least one recommendation is required")
    .max(6),
  suggestedNextSteps: z.array(nextStepSchema).min(1).max(4),
  partnerSupportOpportunity: partnerSupportSchema.nullable().default(null),
});

/** Raw model payload for the Partner Digest. */
export const partnerDigestModelOutputSchema = z.object({
  whatSheMayBeExperiencing: trimmedText.max(800),
  whatMayHelp: z.array(trimmedText.max(300)).min(1).max(6),
  howToCommunicate: z.array(trimmedText.max(300)).min(1).max(6),
  whatToAvoid: z.array(trimmedText.max(300)).max(6).default([]),
  oneSimpleSupportAction: trimmedText.max(300),
  citationIds: z.array(z.string().trim().min(1).max(64)).max(6).default([]),
  /** Premium closer look. Omitted or null on every other plan. */
  advancedObservation: z.string().trim().min(1).max(800).nullable().optional(),
});

export type PersonalSnapshotModelOutput = z.infer<typeof personalSnapshotModelOutputSchema>;
export type PartnerDigestModelOutput = z.infer<typeof partnerDigestModelOutputSchema>;

export const outputSchemas = {
  personal_snapshot: personalSnapshotModelOutputSchema,
  partner_digest: partnerDigestModelOutputSchema,
} as const;

export type OutputSchemaKey = keyof typeof outputSchemas;

/** Maps a Zod issue list to short, client-safe field messages. */
export function formatSchemaIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 10).map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
