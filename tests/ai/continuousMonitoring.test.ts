import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { continuousMonitoringService } from "../../src/services/monitoring/continuousMonitoringService.js";

describe("24-Hour Continuous Monitoring & Accuracy Drift", () => {
  it("runs daily 24h audit scan and generates structured monitoring report", async () => {
    const report = await continuousMonitoringService.runDailyScan(24);

    assert.ok(report.scannedAt);
    assert.equal(report.windowHours, 24);
    assert.ok(typeof report.totalLogsScanned === "number");
    assert.ok(typeof report.hallucinationFlags === "number");
    assert.ok(typeof report.citationIntegrityRate === "string");
    assert.ok(typeof report.averageConfidence === "number");
    assert.ok(typeof report.driftDetected === "boolean");
    assert.ok(Array.isArray(report.trendingSymptoms));
    assert.ok(report.weeklySafetyAudit);
  });

  it("calculates trending symptoms and tracks velocity", async () => {
    const symptoms = await continuousMonitoringService.calculateTrendingSymptoms(new Date());
    assert.ok(symptoms.length > 0);
    assert.ok(symptoms[0].symptom.length > 0);
    assert.ok(symptoms[0].count >= 0);
    assert.ok(["rising", "stable", "declining"].includes(symptoms[0].trend));
  });
});
