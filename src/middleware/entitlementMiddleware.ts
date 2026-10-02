import type { Response, NextFunction } from "express";
import { checkFeature, type ActorLike } from "../services/member/entitlements.js";
import type { EntitlementFeature } from "../config/entitlements.js";
import type { AuthenticatedRequest } from "./authMiddleware.js";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const entitlementLog = logger.module("ENTITLEMENTS-MW");

/**
 * Middleware: refuses a request whose plan does not include the feature.
 *
 * This is the enforcement half of the entitlement architecture. The client also
 * hides locked UI, but a hidden button is a courtesy to the member — this is what
 * actually stops the request. A denial is 402 Payment Required so the client can
 * tell "you need to pay" apart from "you are not allowed" (403).
 *
 * Must be mounted after `requireAuth`, since it reads `req.user`.
 */
export function requireEntitlement(feature: EntitlementFeature) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = req.user;
    if (!user?.userId) {
      // requireAuth should already have stopped this. Refuse rather than pass,
      // because a missing user means the plan cannot be resolved and the safe
      // answer is no.
      sendError(res, 401, "Authentication required. Please log in.");
      return;
    }

    try {
      const actor: ActorLike = { userId: user.userId, role: user.role };
      const verdict = await checkFeature(actor, feature);

      if (!verdict.allowed) {
        entitlementLog.info(`⛔ ${feature} refused`, {
          userId: user.userId,
          plan: verdict.plan,
          reason: verdict.reason,
        });
        sendError(res, 402, verdict.message ?? "This feature is not included in your plan.", {
          feature,
          plan: verdict.plan,
          reason: verdict.reason,
        });
        return;
      }

      next();
    } catch (err) {
      // A database hiccup must not read as "allowed". Fail closed.
      entitlementLog.error(`Entitlement check failed for ${feature}`, err);
      sendError(res, 500, "We could not confirm your access. Please try again.");
    }
  };
}
