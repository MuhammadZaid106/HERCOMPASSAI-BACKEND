import {
  CRISIS_DETECTION_PATTERN,
  DIAGNOSTIC_BLOCK_PATTERNS,
  DIAGNOSTIC_NEGATION_PATTERN,
  DIAGNOSTIC_VOCABULARY_PATTERN,
  MEDICATION_MENTION_PATTERN,
  NUTRITION_BLOCK_PATTERNS,
  NUMERIC_TOKEN_PATTERN,
  PRESCRIPTION_BLOCK_PATTERNS,
  PROGNOSIS_BLOCK_PATTERNS,
  SAFETY_CONTRADICTION_PATTERNS,
  UNSAFE_CONTENT_PATTERNS,
} from "./languagePatterns.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import type { GatewayContext, SciFinding } from "../types/index.js";

/**
 * Guardrail service.
 *
 * Runs in two directions:
 *   - `runPreGenerationGuardrails` blocks a request before any token is spent.
 *   - `runOutputGuardrails` inspects the model response before it can reach SCI
 *     or a user.
 *
 * Guardrails are deterministic software. They never ask a model what is safe.
 */

export interface PreGenerationVerdict {
  allowed: boolean;
  findings: SciFinding[];
}

export interface OutputGuardrailResult {
  findings: SciFinding[];
  /** True when the response discloses crisis content and needs supportive routing. */
  crisisDetected: boolean;
  /** Text fragments the output layer must strip before the response is approved. */
  blocked: boolean;
}

/** Collects every string a model is allowed to state a number from. */
export function collectPermittedNumbers(context: GatewayContext): Set<string> {
  const permitted = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "number" && Number.isFinite(value)) {
      permitted.add(String(value));
      permitted.add(String(Math.round(value)));
    } else if (typeof value === "string") {
      const matches = value.match(NUMERIC_TOKEN_PATTERN);
      if (matches) for (const match of matches) permitted.add(match);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value !== null && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) walk(nested);
    }
  };

  walk(context.deterministic.metrics);

  // Evidence summaries are approved clinical text; a figure quoted from an
  // approved record is grounded, not hallucinated.
  for (const item of context.evidence) walk(item.record.summary);

  return permitted;
}

export function runPreGenerationGuardrails(context: GatewayContext): PreGenerationVerdict {
  const findings: SciFinding[] = [];

  if (context.consent.status !== "granted") {
    findings.push({
      check: "evidence_support",
      severity: "block",
      message: "Active consent is required before personal data may enter AI context.",
    });
  }

  if (context.evidence.length === 0) {
    findings.push({
      check: "evidence_support",
      severity: "block",
      message: "No approved evidence was retrieved. Generation is not permitted without grounding.",
    });
  }

  const unapproved = context.evidence.filter(
    (item) => !AI_GATEWAY_CONFIG.evidence.allowedStatuses.includes(item.record.status)
  );
  if (unapproved.length > 0) {
    findings.push({
      check: "citation_validity",
      severity: "block",
      message: `${unapproved.length} evidence record(s) are not in an approved state.`,
    });
  }

  return {
    allowed: findings.every((finding) => finding.severity !== "block"),
    findings,
  };
}

function matchesAny(
  text: string,
  patterns: ReadonlyArray<{ id: string; pattern: RegExp }>
): string[] {
  return patterns.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);
}

export function runOutputGuardrails(
  rawContent: string,
  context: GatewayContext
): OutputGuardrailResult {
  const findings: SciFinding[] = [];
  const text = rawContent;

  const diagnostic = matchesAny(text, DIAGNOSTIC_BLOCK_PATTERNS);
  if (diagnostic.length > 0) {
    findings.push({
      check: "non_diagnostic_language",
      severity: "block",
      message: `Diagnostic assertion detected (${diagnostic.join(", ")}).`,
    });
  }

  const prescription = matchesAny(text, PRESCRIPTION_BLOCK_PATTERNS);
  if (prescription.length > 0) {
    findings.push({
      check: "medical_risk_language",
      severity: "block",
      message: `Prescription or dosing language detected (${prescription.join(", ")}).`,
    });
  }

  const prognosis = matchesAny(text, PROGNOSIS_BLOCK_PATTERNS);
  if (prognosis.length > 0) {
    findings.push({
      check: "medical_risk_language",
      severity: "block",
      message: `Prognosis prediction detected (${prognosis.join(", ")}).`,
    });
  }

  const unsafe = matchesAny(text, UNSAFE_CONTENT_PATTERNS);
  if (unsafe.length > 0) {
    findings.push({
      check: "unsafe_content",
      severity: "block",
      message: `Unsafe content detected (${unsafe.join(", ")}).`,
    });
  }

  const contradiction = matchesAny(text, SAFETY_CONTRADICTION_PATTERNS);
  if (contradiction.length > 0) {
    findings.push({
      check: "unsafe_content",
      severity: "block",
      message: `Response discourages or replaces professional care (${contradiction.join(", ")}).`,
    });
  }

  const nutrition = matchesAny(text, NUTRITION_BLOCK_PATTERNS);
  if (nutrition.length > 0) {
    findings.push({
      check: "medical_risk_language",
      severity: "block",
      message: `Unsupported nutrition or supplement claim detected (${nutrition.join(", ")}).`,
    });
  }

  // Diagnostic vocabulary is permitted only in negated form, e.g. "not a diagnosis".
  if (DIAGNOSTIC_VOCABULARY_PATTERN.test(text)) {
    const negated = DIAGNOSTIC_NEGATION_PATTERN.test(text);
    findings.push({
      check: "non_diagnostic_language",
      severity: negated ? "warn" : "block",
      message: negated
        ? "Diagnostic vocabulary present but negated. Confirm the framing stays non-diagnostic."
        : "Unqualified diagnostic vocabulary detected.",
    });
  }

  if (MEDICATION_MENTION_PATTERN.test(text)) {
    findings.push({
      check: "medical_risk_language",
      severity: "warn",
      message: "Medication or therapy referenced. Verify it is educational and not instructional.",
    });
  }

  // Hallucination defence: any figure the model states must trace back to the
  // deterministic context or to an approved evidence record.
  if (AI_GATEWAY_CONFIG.numericGrounding.enabled && AI_GATEWAY_CONFIG.numericGrounding.requireTraceableToContext) {
    const permitted = collectPermittedNumbers(context);
    const stated = text.match(NUMERIC_TOKEN_PATTERN) ?? [];
    const ungrounded = Array.from(new Set(stated.filter((token) => !permitted.has(token))));

    if (ungrounded.length > 0) {
      findings.push({
        check: "numeric_grounding",
        severity: "warn",
        message: `Untraceable numeric value(s) in response: ${ungrounded.slice(0, 5).join(", ")}.`,
      });
    }
  }

  return {
    findings,
    crisisDetected: CRISIS_DETECTION_PATTERN.test(text),
    blocked: findings.some((finding) => finding.severity === "block"),
  };
}
