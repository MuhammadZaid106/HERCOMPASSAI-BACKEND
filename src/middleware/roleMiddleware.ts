import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./authMiddleware.js";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const roleLog = logger.module("ROLE-MIDDLEWARE");

/**
 * Roles allowed to reach the internal review and admin surfaces.
 *
 * Kept in one place because `getAiHealth` had its own inline check, which is how
 * two surfaces end up disagreeing about who is an administrator.
 */
export const STAFF_ROLES = ["admin", "developer"] as const;

/**
 * Middleware: restricts a route to staff.
 *
 * Must be mounted after `requireAuth`. Returns 403 rather than 404: the caller is
 * authenticated, and pretending the route does not exist would only make a
 * legitimate operator's mistake harder to diagnose.
 */
export function requireRole(...roles: readonly string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const role = req.user?.role;

    if (!req.user?.userId) {
      sendError(res, 401, "Authentication required. Please log in.");
      return;
    }

    if (!role || !roles.includes(role)) {
      roleLog.warn(`🚫 Role "${role}" attempted a staff-only route`, {
        userId: req.user.userId,
        path: req.originalUrl,
      });
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }

    next();
  };
}

/** Convenience wrapper for the standard staff set. */
export const requireStaff = requireRole(...STAFF_ROLES);
