import { continuousMonitoringService } from "./continuousMonitoringService.js";
import { logger } from "../../utils/logger.js";

const schedLog = logger.module("MONITOR-SCHEDULER");

let scanTimer: NodeJS.Timeout | null = null;

/**
 * Initializes the automated 24-hour continuous monitoring background cron job (Maria's Story Sec 5.1).
 */
export function startContinuousMonitoringScheduler(intervalMs: number = 24 * 60 * 60 * 1000): void {
  if (scanTimer) return;

  schedLog.info("Starting 24-hour continuous monitoring background scanner");

  // Run initial scan on startup asynchronously (non-blocking)
  void continuousMonitoringService
    .runDailyScan(24)
    .catch((err) => schedLog.error("Initial background scan error:", err));

  scanTimer = setInterval(() => {
    void continuousMonitoringService
      .runDailyScan(24)
      .catch((err) => schedLog.error("Scheduled background scan error:", err));
  }, intervalMs);

  // Unref timer so it doesn't prevent Node process graceful exit in test runners
  if (scanTimer && typeof scanTimer.unref === "function") {
    scanTimer.unref();
  }
}

export function stopContinuousMonitoringScheduler(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
    schedLog.info("Stopped continuous monitoring background scanner");
  }
}
