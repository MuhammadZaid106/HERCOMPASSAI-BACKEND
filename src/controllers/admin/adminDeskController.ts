import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import {
  loadAdminAudit,
  loadAdminMetrics,
  loadAdminPartners,
  loadAdminPlans,
  loadAdminSupport,
  loadAdminUser,
  searchAdminEvidence,
  searchAdminUsers,
} from "../../services/admin/adminDesk.js";
import { EvidenceStatus } from "../../models/index.js";
import {
  adminEvidenceQuerySchema,
  adminMetricsQuerySchema,
  adminPageQuerySchema,
  adminSupportQuerySchema,
  adminUserIdSchema,
  adminUserQuerySchema,
} from "./adminSchemas.js";

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
    const parsed = adminMetricsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid window");
      return;
    }
    const metrics = await loadAdminMetrics(new Date(), parsed.data.days);
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
    const result = await searchAdminUsers(parsed.data.q, parsed.data.page, {
      plan: parsed.data.plan,
      role: parsed.data.role,
      account: parsed.data.account,
      subscription: parsed.data.subscription,
    });
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

export async function getAdminAudit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminPageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid page");
      return;
    }
    const result = await loadAdminAudit(parsed.data.page);
    adminLog.info(`Admin audit list returned ${result.rows.length} of ${result.total}`);
    sendSuccess(res, 200, "Audit events retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminSupport(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminSupportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid support query", parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await loadAdminSupport(parsed.data.page, parsed.data.userId);
    adminLog.info(`Admin support list returned ${result.rows.length} of ${result.total}`);
    sendSuccess(res, 200, "Support notes retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminEvidence(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminEvidenceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid evidence search");
      return;
    }
    const records = searchAdminEvidence(parsed.data.q);
    const retiredRows = await EvidenceStatus.findAll({
      where: { status: "retired" },
      attributes: ["evidenceId"],
    });
    const retired = new Set(retiredRows.map((row) => row.evidenceId));
    adminLog.info(`Admin evidence search returned ${records.length}`);
    sendSuccess(res, 200, "Evidence catalog retrieved", {
      records: records.map((record) => ({ ...record, retired: retired.has(record.evidenceId) })),
      clinicianReview: "pending-named-clinician",
    });
  } catch (error) {
    next(error);
  }
}
