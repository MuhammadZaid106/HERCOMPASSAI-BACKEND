import type { Request, Response } from "express";
import { continuousMonitoringService } from "../../services/monitoring/continuousMonitoringService.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const monitorLog = logger.module("MONITOR-CONTROLLER");

/**
 * Gets 24-hour continuous monitoring dashboard summary
 * GET /api/admin/monitoring/dashboard
 */
export async function getMonitoringDashboard(req: Request, res: Response): Promise<void> {
  const hours = typeof req.query.hours === "string" ? parseInt(req.query.hours, 10) : 24;

  try {
    const report = await continuousMonitoringService.runDailyScan(isNaN(hours) ? 24 : hours);
    sendSuccess(res, 200, "Continuous monitoring dashboard retrieved", { report });
  } catch (err) {
    monitorLog.error("Failed to generate monitoring dashboard:", err);
    sendError(res, 500, "Failed to load continuous monitoring dashboard");
  }
}

/**
 * Triggers an immediate continuous monitoring scan on demand
 * POST /api/admin/monitoring/scan
 */
export async function triggerMonitoringScan(req: Request, res: Response): Promise<void> {
  const { hours } = req.body as { hours?: number };

  try {
    const report = await continuousMonitoringService.runDailyScan(hours || 24);
    sendSuccess(res, 200, "24-hour continuous monitoring scan executed", { report });
  } catch (err) {
    monitorLog.error("Failed to run continuous monitoring scan:", err);
    sendError(res, 500, "Failed to execute continuous monitoring scan");
  }
}
