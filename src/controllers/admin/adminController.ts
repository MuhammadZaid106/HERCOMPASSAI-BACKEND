import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import {
  listReviewQueue,
  resolveFlag,
  reviewQueueSummary,
} from "../../services/ai-gateway/feedbackService.js";
import { readAiUsage } from "../../services/member/entitlements.js";
import { AiFlag } from "../../models/index.js";
import { reviewQueueQuerySchema, resolveFlagSchema } from "./adminSchemas.js";

const adminLog = logger.module("ADMIN");

/**
 * Internal review and operations surface.
 *
 * Everything here is behind `requireStaff`, and every handler additionally
 * re-checks the role: the middleware is the gate, this is the belt. A route
 * mounted without the guard should still fail closed.
 */

function requireStaffActor(req: AuthenticatedRequest): string | null {
  const role = req.user?.role;
  return role === "admin" || role === "developer" ? role : null;
}

/**
 * Express types a route param as `string | string[]` because it has no way to know
 * the segment is singular. These routes are all single-segment ids, so a repeated
 * parameter is a malformed request rather than a list to handle.
 */
function singleParam(req: AuthenticatedRequest, name: string): string | null {
  const value = req.params[name];
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

/**
 * GET /api/admin/ai-flags
 *
 * The human-in-the-loop review queue. Existed in the data model and in the
 * documentation from the start, but had no way to be read: a member who pressed
 * "Report Concern" produced a high-severity row that no human could ever see.
 */
export async function listAiFlags(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }

    const parsed = reviewQueueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid filter", parsed.error.flatten().fieldErrors);
      return;
    }

    const result = await listReviewQueue(parsed.data);
    sendSuccess(res, 200, "Review queue retrieved", {
      flags: result.flags,
      total: result.total,
      summary: await reviewQueueSummary(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/ai-flags/:id
 *
 * Move a flag through the review lifecycle. `in_review` claims it without closing
 * it; `resolved` and `dismissed` close it out and mark the underlying feedback as
 * reviewed so it does not resurface.
 */
export async function updateAiFlag(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const actor = requireStaffActor(req);
    if (!actor) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }

    const parsed = resolveFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Invalid review status", parsed.error.flatten().fieldErrors);
      return;
    }

    const flagId = singleParam(req, "id");
    if (!flagId) {
      sendError(res, 400, "A flag id is required.");
      return;
    }

    const updated = await resolveFlag(flagId, actor, parsed.data.status);
    if (!updated) {
      sendError(res, 404, "That flag no longer exists.");
      return;
    }

    const flag = await AiFlag.findByPk(flagId, {
      attributes: ["id", "reviewStatus", "reviewedBy", "reviewedAt"],
    });

    adminLog.info(`Flag ${flagId} reviewed`, { status: parsed.data.status, actor });
    sendSuccess(res, 200, "Flag updated", { flag });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/ai-usage/:userId
 *
 * What a specific member has spent against their allowance. Support needs this
 * when someone reports that their AI insights stopped working — the first
 * question is always whether they hit the limit or hit a bug.
 */
export async function getMemberAiUsage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }

    const userId = singleParam(req, "userId");
    if (!userId) {
      sendError(res, 400, "A member id is required.");
      return;
    }

    const usage = await readAiUsage({ userId });
    sendSuccess(res, 200, "Member AI usage retrieved", { userId, usage });
  } catch (error) {
    next(error);
  }
}
