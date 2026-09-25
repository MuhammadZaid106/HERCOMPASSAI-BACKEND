import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth/generateTokens.js";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const authLog = logger.module("AUTH-MIDDLEWARE");

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: "member" | "partner";
    plan: "free" | "plus" | "premium";
  };
}

/**
 * Middleware: verifies the Bearer JWT access token on protected routes.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, 401, "Authentication required. Please log in.");
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    authLog.warn("Invalid or expired access token");
    sendError(res, 401, "Session expired. Please log in again.");
  }
}
