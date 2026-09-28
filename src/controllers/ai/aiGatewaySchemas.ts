import { z } from "zod";

/**
 * AI Gateway request contracts.
 *
 * Clients may pin a prompt version and a locale. They may NOT submit
 * `user_context`, scores, evidence or confidence — the Gateway builds all of that
 * from server-side data. A client that could inject its own metrics could inject
 * fabricated metrics, which would defeat the "deterministic software calculates"
 * guarantee.
 */

export const aiGenerateSchema = z.object({
  promptVersion: z
    .string()
    .regex(/^v\d+$/, "promptVersion must look like 'v1'")
    .max(16)
    .optional(),
  locale: z.enum(["en-GB", "en-US"]).optional(),
});

export const aiFeedbackSchema = z.object({
  requestId: z.string().uuid("A valid AI requestId is required"),
  feature: z.enum(["personal_snapshot", "ai_insight", "partner_digest"]),
  rating: z.enum(["helpful", "not_helpful", "report_concern"]),
  comment: z.string().trim().max(1000, "Please keep feedback under 1000 characters").optional(),
});

export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;
export type AiFeedbackInput = z.infer<typeof aiFeedbackSchema>;
