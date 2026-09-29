import { randomUUID } from "node:crypto";
import { AI_GATEWAY_CONFIG, getFeaturePolicy } from "../../config/aiGateway.js";
import { logger } from "../../utils/logger.js";
import { runPreGenerationGuardrails, runOutputGuardrails } from "../../ai/guardrails/guardrailService.js";
import { extractJsonObject } from "../../ai/schemas/jsonPayload.js";
import {
  partnerDigestModelOutputSchema,
  personalSnapshotModelOutputSchema,
} from "../../ai/schemas/outputSchemas.js";
import {
  ModelProviderError,
  toClientSafeProviderMessage,
  type AITaskType,
  type ModelGenerationRequest,
  type ModelProviderErrorKind,
} from "../../ai/types/index.js";
import type {
  ConsentScope,
  GatewayActorRole,
  GatewayCitation,
  GatewayContext,
  GatewayFeature,
  GatewayOutput,
  GatewayProvenance,
  GatewayResult,
  GatewayResultStatus,
  GatewaySafetyStatus,
  PartnerDigestOutput,
  PersonalSnapshotOutput,
  SciFinding,
} from "../../ai/types/index.js";
import { buildContext, type ContextSource } from "./contextAssembler.js";
import { assemblePrompt } from "./promptService.js";
import { resolveRoute } from "./modelRouter.js";
import { buildContextCitations, verifyAndRepair } from "./citationVerifier.js";
import { calculateConfidence } from "./confidenceService.js";
import { assessSafety } from "./safetyService.js";
import { runSci, SCI_VERSION } from "./sciValidator.js";
import { buildDigestFallback, buildSnapshotFallback } from "./fallbackService.js";
import { recordAiAudit } from "./auditService.js";

/**
 * HerCompass AI Gateway.
 *
 * The single control point between product features and model providers
 * (spec Section 6). Everything the spec requires the Gateway to own is owned here:
 * authorization, request validation, context assembly, evidence retrieval, model
 * selection, prompt selection, guardrails, SCI, citation verification,
 * confidence, safety checks, logging, error handling and fallback.
 *
 * Pipeline (spec Section 8):
 *   authorize -> validate -> consent -> deterministic context -> retrieve evidence
 *   -> select model -> select prompt -> generate -> validate schema
 *   -> verify citations -> attach confidence -> run SCI -> run safety
 *   -> fallback -> audit -> return approved output
 */

const gatewayLog = logger.module("AI-GATEWAY");

const TASK_BY_FEATURE: Record<GatewayFeature, AITaskType> = {
  personal_snapshot: "structured_generation",
  partner_digest: "structured_generation",
  ai_insight: "interpretation",
};

const ALLOWED_LOCALES = new Set(["en-GB", "en-US"]);

export interface GatewayInvocation {
  feature: GatewayFeature;
  userId: string;
  role: GatewayActorRole;
  consent: ConsentScope;
  source: ContextSource;
  promptVersion?: string;
  locale?: string;
  partnerScope?: string[];
  partnerPreferences?: string[];
  authorizedSignals?: Record<string, string | number | boolean | null>;
  logSignals?: Record<string, string | number | boolean>;
}

interface ProvenanceDraft {
  promptVersion: string;
  promptChecksum: string | null;
  evidenceVersion: string;
  startedAt: string;
  attemptCount: number;
  fallbackUsed: boolean;
  provider: GatewayProvenance["provider"];
  model: string | null;
  modelVersion: string | null;
  resultStatus: GatewayResultStatus;
  safetyStatus: GatewaySafetyStatus;
  confidence: GatewayProvenance["confidence"];
  confidenceScore: number | null;
  citations: string[];
  sciFindings: SciFinding[];
  taskType: AITaskType;
}

function newProvenance(taskType: AITaskType): ProvenanceDraft {
  return {
    promptVersion: "unset",
    promptChecksum: null,
    evidenceVersion: AI_GATEWAY_CONFIG.versions.evidence,
    startedAt: new Date().toISOString(),
    attemptCount: 0,
    fallbackUsed: false,
    provider: null,
    model: null,
    modelVersion: null,
    resultStatus: "blocked",
    safetyStatus: "blocked",
    confidence: null,
    confidenceScore: null,
    citations: [],
    sciFindings: [],
    taskType,
  };
}

function finalizeProvenance(
  requestId: string,
  feature: GatewayFeature,
  draft: ProvenanceDraft
): GatewayProvenance {
  const completedAt = new Date().toISOString();

  return {
    requestId,
    feature,
    provider: draft.provider,
    model: draft.model,
    modelVersion: draft.modelVersion,
    promptVersion: draft.promptVersion,
    evidenceVersion: draft.evidenceVersion,
    sciVersion: SCI_VERSION,
    configVersion: AI_GATEWAY_CONFIG.versions.config,
    taskType: draft.taskType,
    startedAt: draft.startedAt,
    completedAt,
    latencyMs: Math.max(
      0,
      new Date(completedAt).getTime() - new Date(draft.startedAt).getTime()
    ),
    resultStatus: draft.resultStatus,
    confidence: draft.confidence,
    safetyStatus: draft.safetyStatus,
    fallbackUsed: draft.fallbackUsed,
    attemptCount: draft.attemptCount,
    citations: draft.citations,
    sciFindings: draft.sciFindings,
  };
}

type ParsedModelOutput =
  | ReturnType<typeof personalSnapshotModelOutputSchema.parse>
  | ReturnType<typeof partnerDigestModelOutputSchema.parse>;

/** The result body before provenance is attached. */
type GatewayOutcome =
  | { ok: true; output: GatewayOutput }
  | { ok: false; message: string; statusCode: number };

type FailureKind =
  | "disabled"
  | "no_evidence"
  | "no_provider"
  | "schema"
  | "sci_blocked"
  | ModelProviderErrorKind;

function parseModelOutput(
  schemaKey: "personal_snapshot" | "partner_digest",
  payload: Record<string, unknown>
): ParsedModelOutput {
  if (schemaKey === "personal_snapshot") {
    return personalSnapshotModelOutputSchema.parse(payload);
  }
  return partnerDigestModelOutputSchema.parse(payload);
}

function clientMessageFor(kind: FailureKind): { message: string; statusCode: number } {
  switch (kind) {
    case "disabled":
      return { message: "AI insights are temporarily unavailable. Your data is safe — please try again later.", statusCode: 503 };
    case "no_evidence":
      return {
        message:
          "We're still putting your Snapshot together. Your answers are saved — please try again in a moment.",
        statusCode: 503,
      };
    case "no_provider":
      return {
        message: "The intelligence service is not available right now. Your data is saved — please try again shortly.",
        statusCode: 503,
      };
    case "schema":
      return {
        message: "We couldn't prepare this result safely, so we've held it back. Your answers are saved — please try again.",
        statusCode: 422,
      };
    case "sci_blocked":
      return {
        message:
          "We couldn't complete this safely, so nothing was shown. Your answers are saved — please try again.",
        statusCode: 422,
      };
    default:
      return { message: toClientSafeProviderMessage(kind), statusCode: 503 };
  }
}

/** Authorization. AI must never decide authorization (spec Step 55). */
function isAuthorized(feature: GatewayFeature, role: GatewayActorRole): boolean {
  const policy = getFeaturePolicy(feature);
  if (!policy) return false;
  return policy.allowedRoles.includes(role);
}

interface InvocationRejection {
  message: string;
  statusCode: 400 | 403;
  finding: SciFinding;
}

/**
 * Request validation.
 *
 * Rejections are structured rather than free text: the status code and the audit
 * finding must not be inferred by matching words in a message, which is how a
 * missing partner scope and a missing role both ended up reported as 403.
 */
function validateInvocation(invocation: GatewayInvocation): InvocationRejection | null {
  const reject = (
    message: string,
    statusCode: 400 | 403,
    finding: SciFinding
  ): InvocationRejection => ({ message, statusCode, finding });

  if (invocation.userId.trim() === "") {
    return reject("A user identity is required.", 400, {
      check: "response_schema",
      severity: "block",
      message: "Missing user identity.",
    });
  }

  if (!getFeaturePolicy(invocation.feature)) {
    return reject("Unknown feature.", 400, {
      check: "response_schema",
      severity: "block",
      message: "Unknown gateway feature.",
    });
  }

  if (!isAuthorized(invocation.feature, invocation.role)) {
    return reject("You do not have access to that feature.", 403, {
      check: "evidence_support",
      severity: "block",
      message: "The actor's role is not permitted to use this gateway feature.",
    });
  }

  if (invocation.locale && !ALLOWED_LOCALES.has(invocation.locale)) {
    return reject("That request could not be validated.", 400, {
      check: "response_schema",
      severity: "block",
      message: "Unsupported locale.",
    });
  }

  // A partner scope is a consent grant, not a request parameter, so its absence
  // is an authorization failure rather than a malformed request.
  if (invocation.feature === "partner_digest" && (invocation.partnerScope?.length ?? 0) === 0) {
    return reject("You do not have access to that feature.", 403, {
      check: "evidence_support",
      severity: "block",
      message: "Partner features require an active, authorized sharing scope.",
    });
  }

  return null;
}

export async function runGateway(invocation: GatewayInvocation): Promise<GatewayResult> {
  const requestId = randomUUID();
  const taskType = TASK_BY_FEATURE[invocation.feature];
  const draft = newProvenance(taskType);

  const finish = async (result: GatewayOutcome): Promise<GatewayResult> => {
    const provenance = finalizeProvenance(requestId, invocation.feature, draft);
    const response: GatewayResult = { ...result, provenance };
    await recordAiAudit({
      provenance,
      userId: invocation.userId,
      userRole: invocation.role,
      promptChecksum: draft.promptChecksum,
      confidenceScore: draft.confidenceScore,
    });
    return response;
  };

  const failWith = async (
    statusCode: number,
    message: string,
    findings: SciFinding[] = []
  ): Promise<GatewayResult> => {
    draft.resultStatus = "blocked";
    draft.safetyStatus = "blocked";
    draft.sciFindings = findings;
    return finish({ ok: false, message, statusCode });
  };

  /** Standard failure path: derives the client-safe message from the failure kind. */
  const fail = async (
    kind: FailureKind,
    findings: SciFinding[] = []
  ): Promise<GatewayResult> => {
    const { message, statusCode } = clientMessageFor(kind);
    return failWith(statusCode, message, findings);
  };

  if (!AI_GATEWAY_CONFIG.enabled) {
    gatewayLog.warn(`Gateway disabled by configuration. Rejected feature "${invocation.feature}".`);
    const { message, statusCode } = clientMessageFor("disabled");
    return failWith(statusCode, message);
  }

  const rejection = validateInvocation(invocation);
  if (rejection) {
    gatewayLog.warn(
      `Rejected gateway request ${requestId} (${rejection.statusCode}): ${rejection.finding.message}`
    );
    return failWith(rejection.statusCode, rejection.message, [rejection.finding]);
  }

  // ─── Steps 4-8: consent, deterministic context, evidence retrieval ──────────
  const context: GatewayContext = buildContext({
    feature: invocation.feature,
    userId: invocation.userId,
    role: invocation.role,
    requestId,
    source: invocation.source,
    consent: invocation.consent,
    locale: invocation.locale ?? "en-GB",
    promptVersion: invocation.promptVersion ?? "",
    partnerScope: invocation.partnerScope,
    partnerPreferences: invocation.partnerPreferences,
    authorizedSignals: invocation.authorizedSignals,
    logSignals: invocation.logSignals,
  });

  draft.evidenceVersion = context.evidenceVersion;

  const preFlight = runPreGenerationGuardrails(context);
  if (!preFlight.allowed) {
    gatewayLog.warn(
      `Pre-generation guardrails blocked request ${requestId}: ${preFlight.findings
        .filter((finding) => finding.severity === "block")
        .map((finding) => finding.message)
        .join(" | ")}`
    );
    const needsEvidence = preFlight.findings.some(
      (finding) => finding.message.includes("No approved evidence")
    );
    const needsConsent = preFlight.findings.some((finding) => finding.message.includes("consent"));
    return fail(needsConsent ? "sci_blocked" : needsEvidence ? "no_evidence" : "sci_blocked", preFlight.findings);
  }

  const policy = getFeaturePolicy(invocation.feature);
  if (!policy) return fail("schema");

  /**
   * Deterministic fallback (spec Step 17).
   *
   * A member must never be shown an empty screen because an engine was slow,
   * returned malformed JSON, or failed an internal check. The Gateway still owes
   * a grounded, non-diagnostic response built from approved evidence and the
   * deterministic context, with no model-authored string anywhere in it.
   */
  const serveFallback = async (
    findings: SciFinding[] = [],
    citations: GatewayCitation[] = buildContextCitations(context)
  ): Promise<GatewayResult> => {
    // The generation event itself is treated as degraded: no clean finish, no
    // latency success, because in this path no acceptable model output exists.
    const fallbackConfidence = calculateConfidence({
      context,
      citations,
      cleanFinish: false,
      withinLatencyBudget: false,
      noWarnings: true,
    });

    const fallback =
      policy.outputSchemaKey === "personal_snapshot"
        ? buildSnapshotFallback(context, citations, fallbackConfidence)
        : buildDigestFallback(context, citations, fallbackConfidence);

    if (!fallback) {
      const { message, statusCode } = clientMessageFor("no_evidence");
      return failWith(statusCode, message, findings);
    }

    draft.resultStatus = "fallback";
    draft.fallbackUsed = true;
    draft.confidence = fallbackConfidence.confidenceClass;
    draft.confidenceScore = fallbackConfidence.confidenceScore;
    draft.citations = citations.map((citation) => citation.citationId);
    draft.sciFindings = findings;

    gatewayLog.warn(
      `Served the deterministic fallback for request ${requestId} (feature "${invocation.feature}").`
    );

    return finish({ ok: true, output: fallback as GatewayOutput });
  };

  // ─── Step 9-10: model selection and prompt selection ────────────────────────
  let plan;
  try {
    plan = resolveRoute(invocation.feature, taskType);
  } catch (error) {
    gatewayLog.error(
      `Routing failed for request ${requestId}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return fail("no_provider");
  }

  let assembled;
  try {
    assembled = assemblePrompt(context, policy.promptKey, invocation.promptVersion);
  } catch (error) {
    gatewayLog.error(
      `Prompt assembly failed for request ${requestId}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return fail("schema");
  }

  draft.promptVersion = assembled.promptVersion;
  draft.promptChecksum = assembled.bundle.checksum;

  // ─── Step 11: generation, with transport-level fallback ─────────────────────
  let generation = null;
  let lastErrorKind: ModelProviderErrorKind | null = null;

  for (const attempt of plan.attempts) {
    draft.attemptCount += 1;

    const request: ModelGenerationRequest = {
      requestId,
      taskType,
      messages: assembled.messages,
      temperature: plan.temperature,
      maxOutputTokens: plan.maxOutputTokens,
      timeoutMs: AI_GATEWAY_CONFIG.limits.timeoutMs,
      responseFormat: "json_object",
      metadata: {
        feature: invocation.feature,
        promptVersion: assembled.promptVersion,
        attempt: String(attempt.order),
      },
    };

    try {
      generation = await attempt.providerInstance.generate(request);
      draft.provider = generation.provider;
      draft.model = generation.model;
      draft.modelVersion = generation.modelVersion;
      lastErrorKind = null;
      break;
    } catch (error) {
      if (error instanceof ModelProviderError) {
        lastErrorKind = error.kind;
        gatewayLog.warn(
          `Provider "${error.provider}" failed for request ${requestId} (${error.kind}). Trying the next route.`
        );
        // A non-retryable failure means "do not use this engine again", not
        // "abandon the request". Skipping to the next route is what lets a
        // configured fallback serve the member when the primary is unconfigured.
        continue;
      }
      gatewayLog.error(
        `Unexpected provider failure for request ${requestId}.`,
        error instanceof Error ? error.message : undefined
      );
      lastErrorKind = "unknown";
      break;
    }
  }

  if (!generation) {
    // Every route failed. The member still gets a grounded response.
    return serveFallback([
      {
        check: "response_schema",
        severity: "warn",
        message: `No model produced a usable response (${lastErrorKind ?? "no_provider"}). Served the deterministic fallback.`,
      },
    ]);
  }

  // ─── Step 12: schema validation ────────────────────────────────────────────
  let repaired;
  try {
    const rawPayload = extractJsonObject(generation.content, generation.provider);
    repaired = parseModelOutput(policy.outputSchemaKey, rawPayload);
  } catch (error) {
    gatewayLog.warn(
      `Generated response for request ${requestId} failed schema validation. Falling back.`
    );
    return serveFallback([
      {
        check: "response_schema",
        severity: "warn",
        message:
          "Generated payload did not satisfy the feature output contract. Served the deterministic fallback.",
      },
    ]);
  }

  // ─── Steps 13 + guardrails: claim verification and language safety ──────────
  const guardrailResult = runOutputGuardrails(generation.content, context);

  if (guardrailResult.crisisDetected) {
    const crisisFindings: SciFinding[] = [
      {
        check: "unsafe_content",
        severity: "block",
        message: "Response disclosed crisis content and was withheld.",
      },
    ];

    const assessment = assessSafety(crisisFindings, { crisisDetected: true });
    gatewayLog.warn(`Withheld a response for request ${requestId}: crisis content detected.`);

    return failWith(
      422,
      assessment.crisisNotice ??
        "It sounds like things are really hard right now. Please reach out to someone you trust or a local crisis helpline today.",
      crisisFindings
    );
  }

  if (guardrailResult.blocked) {
    // A safety violation must never reach the member, but it also must not read as
    // a system error: the deterministic fallback is safe, grounded, and useful.
    return serveFallback(
      guardrailResult.findings.filter((finding) => finding.severity === "block")
    );
  }

  const verification = verifyAndRepair(repaired, context);
  draft.citations = verification.usedCitationIds;

  // ─── Step 14: deterministic confidence ──────────────────────────────────────
  const confidence = calculateConfidence({
    context,
    citations: verification.citations,
    cleanFinish: generation.finishReason === "stop",
    withinLatencyBudget: generation.latencyMs <= AI_GATEWAY_CONFIG.limits.timeoutMs,
    noWarnings: guardrailResult.findings.every((finding) => finding.severity !== "warn"),
  });

  draft.confidence = confidence.confidenceClass;
  draft.confidenceScore = confidence.confidenceScore;

  // ─── Steps 15-16: SCI and safety ────────────────────────────────────────────
  const sci = runSci({
    feature: invocation.feature,
    context: { requestId },
    repaired: verification.repaired,
    guardrailFindings: guardrailResult.findings,
    verification,
    minCitations: plan.minCitations,
    confidencePresent: confidence !== null,
    safetyNoticePresent: AI_GATEWAY_CONFIG.safetyNotice.trim().length > 0,
  });

  const safety = assessSafety(sci.findings, { crisisDetected: false });
  draft.sciFindings = sci.findings;
  draft.safetyStatus = safety.status;

  if (!sci.passed) {
    // ─── Step 17: block -> safe fallback -> log ───────────────────────────────
    return serveFallback(sci.findings, verification.citations);
  }

  const output: GatewayOutput =
    policy.outputSchemaKey === "personal_snapshot"
      ? ({
          snapshotVersion: AI_GATEWAY_CONFIG.versions.config,
          ...verification.repaired,
          evidence: verification.citations,
          confidence,
          safetyStatus: "approved",
          safetyNotice: safety.notice,
        } as PersonalSnapshotOutput)
      : ({
          digestVersion: AI_GATEWAY_CONFIG.versions.config,
          ...verification.repaired,
          evidence: verification.citations,
          confidence,
          safetyStatus: "approved",
          safetyNotice: safety.notice,
        } as PartnerDigestOutput);

  draft.resultStatus =
    verification.findings.length > 0 || safety.status === "pass_with_warnings"
      ? "approved_with_repairs"
      : "approved";

  return finish({ ok: true, output });
}
