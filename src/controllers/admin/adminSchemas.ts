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
});

export const adminUserIdSchema = z.string().uuid();

export type ReviewQueueQueryInput = z.infer<typeof reviewQueueQuerySchema>;
export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;
export type AdminUserQueryInput = z.infer<typeof adminUserQuerySchema>;
