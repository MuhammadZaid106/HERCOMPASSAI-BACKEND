import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import type { GatewaySafetyStatus, SciFinding } from "../../ai/types/index.js";

/**
 * Safety status resolution.
 *
 * The Gateway owns safety language. Model output is never shipped with its own
 * disclaimer attached — the notice below is a reviewed, deterministic constant so
 * every approved response carries identical, approved wording.
 */

export interface SafetyAssessment {
  status: GatewaySafetyStatus;
  notice: string;
  crisisNotice: string | null;
  findings: SciFinding[];
}

const CRISIS_NOTICE =
  "It sounds like things are really hard right now. You do not have to handle this alone — please reach out to a trusted person, a doctor, or a local crisis helpline today. If you are in immediate danger, contact your local emergency services.";

export function assessSafety(
  findings: SciFinding[],
  options: { crisisDetected: boolean }
): SafetyAssessment {
  const blocks = findings.filter((finding) => finding.severity === "block");
  const warnings = findings.filter((finding) => finding.severity === "warn");

  if (options.crisisDetected) {
    return {
      status: "blocked",
      notice: AI_GATEWAY_CONFIG.safetyNotice,
      crisisNotice: CRISIS_NOTICE,
      findings,
    };
  }

  if (blocks.length > 0) {
    return {
      status: "blocked",
      notice: AI_GATEWAY_CONFIG.safetyNotice,
      crisisNotice: null,
      findings,
    };
  }

  return {
    status: warnings.length > 0 ? "pass_with_warnings" : "pass",
    notice: AI_GATEWAY_CONFIG.safetyNotice,
    crisisNotice: null,
    findings,
  };
}
