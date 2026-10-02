import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { logger } from "../../utils/logger.js";
import type {
  GatewayConfidence,
  GatewaySafetyStatus,
  SciFinding,
} from "../../ai/types/index.js";
import type {
  PartnerDigestModelOutput,
  PersonalSnapshotModelOutput,
} from "../../ai/schemas/outputSchemas.js";
import type { VerificationResult } from "./citationVerifier.js";

const sciLog = logger.module("AI-SCI");

/**
 * SCI — Safety, Compliance and Intelligence validation layer (spec Step 22).
 *
 *   Model output -> schema validation -> SCI -> evidence verification
 *   -> safety validation -> approved output
 *
 *   On failure: BLOCK -> SAFE FALLBACK -> LOG
 *
 * "Never silently display a failed response." Every finding is logged and
 * returned with the provenance record, whether it blocks or warns.
 */

export const SCI_VERSION = AI_GATEWAY_CONFIG.versions.sci;

export interface SciInput {
  feature: string;
  context: { requestId: string };
  repaired: PersonalSnapshotModelOutput | PartnerDigestModelOutput;
  guardrailFindings: SciFinding[];
  verification: VerificationResult;
  minCitations: number;
  /**
   * The deterministic confidence the Gateway intends to attach.
   *
   * The confidence object itself, not a pre-resolved boolean. The Gateway used to
   * pass `confidence !== null`, but `calculateConfidence` has no path that returns
   * null, so the check could never fail and a regression that dropped confidence
   * from the approved output entirely would have passed SCI unnoticed.
   */
  confidence: GatewayConfidence | null;
  /** The safety notice the Gateway intends to attach, for the same reason. */
  safetyNotice: string;
}

export interface SciResult {
  passed: boolean;
  safetyStatus: GatewaySafetyStatus;
  findings: SciFinding[];
}

function isSnapshot(
  payload: PersonalSnapshotModelOutput | PartnerDigestModelOutput
): payload is PersonalSnapshotModelOutput {
  return "personalizedRecommendations" in payload;
}

/** The Snapshot must always contain all eight contracted components. */
function checkSnapshotSections(payload: PersonalSnapshotModelOutput): SciFinding[] {
  const findings: SciFinding[] = [];

  const blocks: Array<[string, string]> = [
    ["symptomPattern", payload.symptomPattern.summary],
    ["moodPattern", payload.moodPattern.summary],
    ["sleepPattern", payload.sleepPattern.summary],
    ["energyPattern", payload.energyPattern.summary],
  ];

  for (const [name, summary] of blocks) {
    if (summary.trim().length < 10) {
      findings.push({
        check: "required_sections",
        severity: "block",
        message: `Section "${name}" is missing or too short to be meaningful.`,
        path: name,
      });
    }
  }

  if (payload.personalizedRecommendations.length < AI_GATEWAY_CONFIG.limits.minRecommendations) {
    findings.push({
      check: "required_sections",
      severity: "block",
      message: "No evidence-supported recommendation survived verification.",
      path: "personalizedRecommendations",
    });
  }

  const horizons = new Set(payload.suggestedNextSteps.map((step) => step.horizon));
  if (horizons.size === 0) {
    findings.push({
      check: "required_sections",
      severity: "block",
      message: "No next steps were produced.",
      path: "suggestedNextSteps",
    });
  } else if (payload.suggestedNextSteps.length > 1 && horizons.size < payload.suggestedNextSteps.length) {
    findings.push({
      check: "required_sections",
      severity: "warn",
      message: "Next steps contain duplicate horizons.",
      path: "suggestedNextSteps",
    });
  }

  if (payload.lifestyleObservations.length === 0) {
    findings.push({
      check: "required_sections",
      severity: "warn",
      message: "No lifestyle observations were produced. Check that no lifestyle data was supplied.",
      path: "lifestyleObservations",
    });
  }

  return findings;
}

function checkDigestSections(payload: PartnerDigestModelOutput): SciFinding[] {
  const findings: SciFinding[] = [];

  if (payload.whatSheMayBeExperiencing.trim().length < 10) {
    findings.push({
      check: "required_sections",
      severity: "block",
      message: "Digest is missing its opening summary.",
      path: "whatSheMayBeExperiencing",
    });
  }

  if (payload.howToCommunicate.length === 0) {
    findings.push({
      check: "required_sections",
      severity: "block",
      message: "Digest contains no communication guidance.",
      path: "howToCommunicate",
    });
  }

  if (payload.oneSimpleSupportAction.trim().length < 5) {
    findings.push({
      check: "required_sections",
      severity: "block",
      message: "Digest is missing its single support action.",
      path: "oneSimpleSupportAction",
    });
  }

  if (payload.whatToAvoid.length === 0) {
    findings.push({
      check: "required_sections",
      severity: "warn",
      message: "Digest contains no avoid-list guidance.",
      path: "whatToAvoid",
    });
  }

  return findings;
}

export function runSci(input: SciInput): SciResult {
  const findings: SciFinding[] = [...input.guardrailFindings, ...input.verification.findings];

  // Schema validation already succeeded — we only reach SCI with a parsed payload.
  findings.push({
    check: "response_schema",
    severity: "warn",
    message: "Structured payload parsed and validated against the feature output contract.",
  });

  findings.push(
    ...(isSnapshot(input.repaired)
      ? checkSnapshotSections(input.repaired)
      : checkDigestSections(input.repaired))
  );

  // Citation presence and validity.
  if (input.verification.citations.length < input.minCitations) {
    findings.push({
      check: "citation_presence",
      severity: "block",
      message: `Response carries ${input.verification.citations.length} verified citation(s); ${input.minCitations} required.`,
    });
  }

  if (input.verification.usedCitationIds.length === 0) {
    findings.push({
      check: "evidence_support",
      severity: "block",
      message: "Response contains claims with no evidence support.",
    });
  }

  if (input.verification.unsupportable) {
    findings.push({
      check: "evidence_support",
      severity: "block",
      message: "Response could not be grounded in approved evidence after repair.",
    });
  }

  if (
    input.confidence === null ||
    typeof input.confidence.confidenceScore !== "number" ||
    !Number.isFinite(input.confidence.confidenceScore)
  ) {
    findings.push({
      check: "confidence_present",
      severity: "block",
      message: "Deterministic confidence was not attached to the response.",
    });
  }

  if (input.safetyNotice.trim().length === 0) {
    findings.push({
      check: "safety_language",
      severity: "block",
      message: "The approved safety notice is missing.",
    });
  }

  const passed = findings.every((finding) => finding.severity !== "block");
  const safetyStatus: GatewaySafetyStatus = passed
    ? findings.some((finding) => finding.severity === "warn")
      ? "pass_with_warnings"
      : "pass"
    : "blocked";

  if (!passed) {
    sciLog.warn(
      `SCI blocked response for request ${input.context.requestId} (feature ${input.feature}).`,
      findings.filter((finding) => finding.severity === "block").map((finding) => `${finding.check}: ${finding.message}`)
    );
  }

  return { passed, safetyStatus, findings };
}
