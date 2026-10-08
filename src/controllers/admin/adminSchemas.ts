import { z } from "zod";

/**
 * Admin review queue contracts.
 *
 * Bounded strings and enums on every field. These endpoints are staff-only, but
 * the query parameters arrive from a browser like any other request, so they are
 * validated rather than cast.
 */

export const reviewQueueQuerySchema = z.object({
  status: z
    .enum(["open", "in_review", "resolved", "dismissed", "all"])
    .default("open"),
  severity: z.enum(["low", "medium", "high"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const resolveFlagSchema = z.object({
  status: z.enum(["in_review", "resolved", "dismissed"]),
});

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  plan: z.enum(["free", "plus", "premium"]).optional(),
  role: z.enum(["member", "partner", "admin", "developer"]).optional(),
  account: z.enum(["confirmed", "unconfirmed"]).optional(),
});

export const adminPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const adminSupportQuerySchema = adminPageQuerySchema.extend({
  userId: z.string().uuid().optional(),
});

export const adminEvidenceQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
});

export const adminMetricsQuerySchema = z.object({
  days: z.coerce.number().int().refine((value) => value === 14 || value === 30).default(14),
});

export const adminBetaQuerySchema = z.object({
  cohort: z.string().trim().max(40).optional(),
});

export const adminBetaMemberSchema = z.object({
  cohortId: z.string().uuid(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

export const adminBetaStageSchema = z.object({
  stage: z.enum(["invited", "screened"]),
});

export const adminContentQuerySchema = z.object({
  kind: z.enum(["recipe", "workout", "meditation"]).optional(),
});

export const adminProductNoteSchema = z.object({
  theme: z.enum([
    "value",
    "friction",
    "trust",
    "ai_quality",
    "safety",
    "partner",
    "workplace",
    "retention",
    "missing",
    "payment",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  decision: z.enum(["open", "accepted", "parked"]),
  resolution: z.string().trim().max(500).default(""),
});

export const adminEvidenceStatusSchema = z.object({
  status: z.enum(["active", "retired"]),
  note: z.string().trim().max(280).default(""),
});

export const adminSystemQuerySchema = z.object({
  probe: z.enum(["gateway"]).optional(),
});

export const adminSettingsSchema = z.object({
  foundingCap: z.coerce.number().int().min(1).max(10000),
});

export const adminUserIdSchema = z.string().uuid();

export type ReviewQueueQueryInput = z.infer<typeof reviewQueueQuerySchema>;
export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;
export type AdminUserQueryInput = z.infer<typeof adminUserQuerySchema>;
