import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import {
  loadAdminMetrics,
  loadAdminPartners,
  loadAdminPlans,
  loadAdminUser,
  searchAdminUsers,
} from "../../services/admin/adminDesk.js";
import { adminUserIdSchema, adminUserQuerySchema } from "./adminSchemas.js";

const adminLog = logger.module("ADMIN");

function requireStaffActor(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  return role === "admin" || role === "developer";
}

function singleParam(req: AuthenticatedRequest, name: string): string | null {
  const value = req.params[name];
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export async function getAdminMetrics(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const metrics = await loadAdminMetrics();
    adminLog.info("Admin metrics loaded");
    sendSuccess(res, 200, "Operations counts retrieved", metrics);
  } catch (error) {
    next(error);
  }
}

export async function getAdminUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminUserQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid search", parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await searchAdminUsers(parsed.data.q, parsed.data.page);
    adminLog.info(`Admin user search returned ${result.users.length} of ${result.total}`);
    sendSuccess(res, 200, "Accounts retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const rawId = singleParam(req, "id");
    const parsed = adminUserIdSchema.safeParse(rawId);
    if (!parsed.success) {
      sendError(res, 400, "Invalid account id");
      return;
    }
    const user = await loadAdminUser(parsed.data);
    if (!user) {
      sendError(res, 404, "That account was not found.");
      return;
    }
    adminLog.info("Admin account record opened");
    sendSuccess(res, 200, "Account retrieved", { user });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPartners(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const result = await loadAdminPartners();
    adminLog.info(`Admin partner list returned ${result.invites.length} invitations`);
    sendSuccess(res, 200, "Partner invitations retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminPlans(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const result = await loadAdminPlans();
    adminLog.info("Admin plan catalog loaded");
    sendSuccess(res, 200, "Plans retrieved", result);
  } catch (error) {
    next(error);
  }
}
