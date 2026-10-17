import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { fineTuningService } from "../../services/ml/fineTuningService.js";
import { evaluationRunner } from "../../services/ml/evaluationRunner.js";
import { searchApprovedEvidenceVector } from "../../services/ai-gateway/vectorService.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const mlLog = logger.module("ML-ADMIN-CONTROLLER");

/**
 * Runs automated candidate model benchmark evaluation
 * POST /api/admin/ml/benchmark
 */
export async function runModelBenchmark(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { candidateModel } = req.body as { candidateModel?: string };
  const staffUserId = req.user?.userId || "admin-ml-evaluator";

  try {
    const scorecard = await evaluationRunner.runCandidateBenchmark({
      candidateModel: candidateModel || "med42-candidate-v1",
      staffUserId,
    });
    sendSuccess(res, 200, "Candidate model benchmark completed", { scorecard });
  } catch (err) {
    mlLog.error("Benchmark execution failed:", err);
    sendError(res, 500, "Failed to run model evaluation benchmark");
  }
}

/**
 * Exports clinician-verified fine-tuning training dataset (JSONL)
 * GET /api/admin/ml/export-dataset
 */
export async function exportDataset(req: Request, res: Response): Promise<void> {
  try {
    const dataset = await fineTuningService.exportClinicianDataset();
    if (req.query.format === "raw") {
      res.setHeader("Content-Type", "application/jsonl");
      res.setHeader("Content-Disposition", 'attachment; filename="hercompass_finetuning_dataset.jsonl"');
      res.send(dataset.jsonl);
      return;
    }
    sendSuccess(res, 200, "Clinician fine-tuning dataset exported", dataset);
  } catch (err) {
    mlLog.error("Failed to export dataset:", err);
    sendError(res, 500, "Failed to generate fine-tuning dataset");
  }
}

/**
 * Gets LoRA training configuration
 * GET /api/admin/ml/lora-config
 */
export async function getLoraConfig(req: Request, res: Response): Promise<void> {
  const modelType = req.query.model === "med42" ? "med42" : "llama-3";
  const config = fineTuningService.getLoraConfig(modelType);
  sendSuccess(res, 200, "LoRA hyperparameters retrieved", { config });
}

/**
 * Semantic vector similarity diagnosis endpoint
 * GET /api/admin/ml/vector-search?query=...
 */
export async function searchEvidenceVector(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.query === "string" ? req.query.query : "hot flashes night sweats";
  const minSim = typeof req.query.minSim === "string" ? parseFloat(req.query.minSim) : 0.15;

  try {
    const results = searchApprovedEvidenceVector(query, { minSimilarity: isNaN(minSim) ? 0.15 : minSim });
    sendSuccess(res, 200, "Semantic vector search completed", {
      query,
      resultsCount: results.length,
      results: results.map((r) => ({
        evidenceId: r.record.evidenceId,
        title: r.record.title,
        source: r.record.sourceName,
        similarity: r.similarity,
        matchedConcepts: r.matchedConcepts,
      })),
    });
  } catch (err) {
    mlLog.error("Vector search failed:", err);
    sendError(res, 500, "Semantic vector search failed");
  }
}
