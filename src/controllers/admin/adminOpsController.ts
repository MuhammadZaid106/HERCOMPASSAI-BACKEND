import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import { contentWriteSchema } from "../../services/member/publishedLibrary.js";
import {
  addBetaMember,
  createAdminContent,
  loadAdminBeta,
  loadAdminContent,
  loadAdminSettings,
  loadAdminSystem,
  loadProductNotes,
  saveFoundingCap,
  saveProductNote,
  setBetaStage,
  setEvidenceRetired,
  updateAdminContent,
} from "../../services/admin/adminOps.js";
import {
  adminBetaMemberSchema,
  adminBetaQuerySchema,
  adminBetaStageSchema,
  adminContentQuerySchema,
  adminEvidenceStatusSchema,
  adminPageQuerySchema,
  adminProductNoteSchema,
  adminSettingsSchema,
  adminSystemQuerySchema,
  adminUserIdSchema,
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

export async function getAdminSystem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminSystemQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid system check");
      return;
    }
    const checks = await loadAdminSystem(parsed.data.probe === "gateway");
    adminLog.info("Admin system checks loaded");
    sendSuccess(res, 200, "System checks retrieved", { checks });
  } catch (error) {
    next(error);
  }
}

export async function getAdminBeta(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminBetaQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid cohort");
      return;
    }
    const result = await loadAdminBeta(parsed.data.cohort);
    adminLog.info(`Admin beta desk loaded ${result.members.length} people`);
    sendSuccess(res, 200, "Beta cohorts retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function postAdminBetaMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminBetaMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Enter a valid email for a cohort");
      return;
    }
    const outcome = await addBetaMember(parsed.data.cohortId, parsed.data.email);
    if (outcome === "missing") {
      sendError(res, 404, "That cohort was not found.");
      return;
    }
    if (outcome === "duplicate") {
      sendError(res, 409, "That email is already in this cohort.");
      return;
    }
    if (outcome === "full") {
      sendError(res, 409, "That cohort is at its cap.");
      return;
    }
    adminLog.info("Admin beta member added");
    sendSuccess(res, 201, "Person added to the cohort", { added: true });
  } catch (error) {
    next(error);
  }
}

export async function patchAdminBetaMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const id = adminUserIdSchema.safeParse(singleParam(req, "id"));
    const parsed = adminBetaStageSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      sendError(res, 400, "Choose invited or screened");
      return;
    }
    const saved = await setBetaStage(id.data, parsed.data.stage);
    if (!saved) {
      sendError(res, 404, "That person was not found in a cohort.");
      return;
    }
    adminLog.info("Admin beta stage updated");
    sendSuccess(res, 200, "Stage updated", { stage: parsed.data.stage });
  } catch (error) {
    next(error);
  }
}

export async function getAdminContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminContentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "Invalid content filter");
      return;
    }
    const pieces = await loadAdminContent(parsed.data.kind);
    adminLog.info(`Admin content list returned ${pieces.length}`);
    sendSuccess(res, 200, "Content retrieved", { pieces });
  } catch (error) {
    next(error);
  }
}

export async function postAdminContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = contentWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Check the title, slug, and fields for this piece");
      return;
    }
    const piece = await createAdminContent(parsed.data);
    if (piece === "duplicate") {
      sendError(res, 409, "A piece with that slug already exists.");
      return;
    }
    adminLog.info(`Admin content piece created (${piece.kind})`);
    sendSuccess(res, 201, "Draft saved", { piece });
  } catch (error) {
    next(error);
  }
}

export async function patchAdminContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const id = adminUserIdSchema.safeParse(singleParam(req, "id"));
    if (!id.success) {
      sendError(res, 400, "Invalid content id");
      return;
    }
    const piece = await updateAdminContent(id.data, req.body);
    if (piece === "missing") {
      sendError(res, 404, "That piece was not found.");
      return;
    }
    if (piece === "invalid") {
      sendError(res, 400, "Those fields do not match this kind of piece");
      return;
    }
    adminLog.info("Admin content piece updated");
    sendSuccess(res, 200, "Content updated", { piece });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProductNotes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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
    const result = await loadProductNotes(parsed.data.page);
    adminLog.info(`Admin product notes returned ${result.notes.length}`);
    sendSuccess(res, 200, "Product notes retrieved", result);
  } catch (error) {
    next(error);
  }
}

export async function patchAdminProductNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const id = adminUserIdSchema.safeParse(singleParam(req, "id"));
    const parsed = adminProductNoteSchema.safeParse(req.body);
    const owner = req.user?.userId;
    if (!id.success || !parsed.success || !owner) {
      sendError(res, 400, "Choose a theme, severity, and decision");
      return;
    }
    const saved = await saveProductNote(id.data, owner, parsed.data);
    if (!saved) {
      sendError(res, 404, "That support note was not found.");
      return;
    }
    adminLog.info("Admin product note reviewed");
    sendSuccess(res, 200, "Product note saved", { saved: true });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSettings(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const settings = await loadAdminSettings();
    adminLog.info("Admin settings loaded");
    sendSuccess(res, 200, "Settings retrieved", settings);
  } catch (error) {
    next(error);
  }
}

export async function patchAdminSettings(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const parsed = adminSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Enter a cap between 1 and 10000");
      return;
    }
    const foundingCap = await saveFoundingCap(parsed.data.foundingCap);
    adminLog.info("Admin founding cap updated");
    sendSuccess(res, 200, "Cap saved", { foundingCap });
  } catch (error) {
    next(error);
  }
}

export async function patchAdminEvidence(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!requireStaffActor(req)) {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }
    const evidenceId = singleParam(req, "evidenceId");
    const parsed = adminEvidenceStatusSchema.safeParse(req.body);
    const staffUserId = req.user?.userId;
    if (!evidenceId || !parsed.success || !staffUserId) {
      sendError(res, 400, "Choose active or retired");
      return;
    }
    const saved = await setEvidenceRetired(evidenceId, parsed.data.status, staffUserId, parsed.data.note);
    if (!saved) {
      sendError(res, 404, "That source is not in the approved catalog.");
      return;
    }
    adminLog.info(`Admin evidence status set to ${parsed.data.status}`);
    sendSuccess(res, 200, "Evidence status saved", { status: parsed.data.status });
  } catch (error) {
    next(error);
  }
}
