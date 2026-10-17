import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { academicIngestionService } from "../../services/academic/academicIngestionService.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const academicLog = logger.module("ACADEMIC-CONTROLLER");

/**
 * Searches PubMed and Semantic Scholar for candidate evidence
 * GET /api/admin/evidence/academic/search?query=...
 */
export async function searchAcademicEvidence(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.query === "string" ? req.query.query : "menopause sleep vasomotor";
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 6;

  try {
    const candidates = await academicIngestionService.searchAndEnrich(query, isNaN(limit) ? 6 : limit);
    sendSuccess(res, 200, "Academic evidence candidates retrieved", { candidates });
  } catch (err) {
    academicLog.error("Failed to search academic evidence:", err);
    sendError(res, 500, "Failed to query PubMed and Semantic Scholar pipelines");
  }
}

/**
 * Ingests a specific paper by PMID into the Evidence Submission queue
 * POST /api/admin/evidence/academic/ingest
 */
export async function ingestAcademicPaper(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { pmid, note } = req.body as { pmid?: string; note?: string };

  if (!pmid || typeof pmid !== "string") {
    sendError(res, 400, "Valid PubMed ID (pmid) is required");
    return;
  }

  const staffUserId = req.user?.userId || "admin-academic-pipeline";

  try {
    const result = await academicIngestionService.ingestPaper(pmid, staffUserId, note);
    if (!result.success) {
      sendError(res, 422, result.message);
      return;
    }
    sendSuccess(res, 201, result.message, { submissionId: result.submissionId, pmid });
  } catch (err) {
    academicLog.error(`Failed to ingest paper PMID ${pmid}:`, err);
    sendError(res, 500, "Failed to ingest paper into clinical evidence queue");
  }
}
