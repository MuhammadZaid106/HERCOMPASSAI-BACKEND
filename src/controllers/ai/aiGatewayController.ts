import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { AiAuditLog } from "../../models/index.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import { getProviderHealth } from "../../ai/providers/index.js";
import { listPromptBundles } from "../../ai/prompts/index.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { loadInsightLogSignals } from "../../services/member/loadInsightLogSignals.js";
import { consumeAiGeneration } from "../../services/member/entitlements.js";
import {
  loadContextSource,
  runGateway,
  recordAiFeedback,
  describeRouting,
  partnerSupportIsRelevant,
} from "../../services/ai-gateway/index.js";
import { aiGenerateSchema, aiFeedbackSchema } from "./aiGatewaySchemas.js";
import type { ConsentScope, GatewayFeature } from "../../ai/types/index.js";

const aiLog = logger.module("AI-CONTROLLER");

/**
 * AI Gateway HTTP surface.
 *
 * Thin by design. The Gateway owns the intelligence decisions; this layer owns
 * authentication, request validation, and the user-facing response envelope.
 */

/**
 * Consent types that explicitly authorise personalised AI processing.
 *
 * The database default is `legacy_assessment`, which predates versioned consent.
 * Records carrying it are treated as NOT consented, because the spec requires
 * versioned, auditable consent before personal data enters AI context. Adding a
 * type here is an evidence-governance decision, not a code shortcut.
 */
const EXPLICIT_CONSENT_TYPES = new Set(["wellness_personalization"]);

/** Consent is read from the server-side record, never asserted by the client. */
function consentFromProfile(profile: {
  consentVersion: string;
  consentType: string;
  consentTimestamp: Date;
}): ConsentScope {
  const granted = EXPLICIT_CONSENT_TYPES.has(profile.consentType);

  return {
    consentId: `${profile.consentType}:${profile.consentVersion}`,
    consentType: profile.consentType,
    consentVersion: profile.consentVersion,
    status: granted ? "granted" : "revoked",
  };
}

interface GenerateOptions {
  feature: GatewayFeature;
  successMessage: string;
  logSignals?: Record<string, string | number | boolean>;
}

async function handleGenerate(
  req: AuthenticatedRequest,
  res: Response,
  options: GenerateOptions
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const role = req.user?.role;
  if (!role) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const parsed = aiGenerateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, 400, "Invalid AI request", parsed.error.flatten().fieldErrors);
    return;
  }

  const source = await loadContextSource(userId);
  if (!source) {
    sendError(res, 404, "Please complete your 5-minute assessment before generating AI insights.");
    return;
  }

  const consent = consentFromProfile(source.profile);
  if (consent.status !== "granted") {
    sendError(
      res,
      403,
      "We need your current consent before generating personalised insights. Please review your privacy settings."
    );
    return;
  }

  // Metered before the model runs, not after. A plan limit that is checked once the
  // work is already done is a report, not a limit. A refused generation spends
  // nothing and never reaches a provider.
  const quota = await consumeAiGeneration({ userId, role });
  if (!quota.allowed) {
    aiLog.info(`⛔ AI generation refused for plan ${quota.plan} (${quota.reason})`, { userId });
    sendError(res, 402, quota.message ?? "You have reached the AI insight limit for your plan.", {
      reason: quota.reason,
      plan: quota.plan,
      remaining: quota.remaining === null || quota.remaining === undefined
        ? "unlimited"
        : String(quota.remaining),
      resetsAt: quota.resetsAt ?? "unlimited",
    });
    return;
  }

  const result = await runGateway({
    feature: options.feature,
    userId,
    role,
    consent,
    source,
    promptVersion: parsed.data.promptVersion,
    locale: parsed.data.locale,
    // Partner relevance is only advertised to the model when the member indicated
    // it. Invitation never implies sharing (spec Step 52).
    partnerScope: partnerSupportIsRelevant(source.profile)
      ? (source.profile.partnerSharingScopes ?? [])
      : [],
    logSignals: options.logSignals,
  });

  if (!result.ok) {
    sendError(res, result.statusCode, result.message);
    return;
  }

  sendSuccess(res, 200, options.successMessage, {
    output: result.output,
    // Provenance travels to the client so feedback can reference a requestId,
    // while internal SCI findings stay on the server.
    meta: {
      requestId: result.provenance.requestId,
      resultStatus: result.provenance.resultStatus,
      confidence: result.provenance.confidence,
      safetyStatus: result.provenance.safetyStatus,
      promptVersion: result.provenance.promptVersion,
      evidenceVersion: result.provenance.evidenceVersion,
      sciVersion: result.provenance.sciVersion,
      modelVersion: result.provenance.modelVersion,
      // Only present on a degraded result. Carries the classification, not the
      // provider's raw text, so a member-facing surface can say what happened
      // without exposing our infrastructure.
      diagnostics: result.diagnostics,
      // Lets a member-facing surface show "4 of 5 AI insights left" without a
      // second request, and without the client guessing.
      usage: {
        plan: quota.plan,
        remaining: quota.remaining ?? null,
        resetsAt: quota.resetsAt ?? null,
      },
    },
  });
}

/**
 * Generate the HerCompass Personal Menopause Snapshot™
 * POST /api/ai/snapshot
 */
export async function generateSnapshot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await handleGenerate(req, res, {
      feature: "personal_snapshot",
      successMessage: "Your Personal Menopause Snapshot is ready",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generate a short AI insight for the member dashboard
 * POST /api/ai/insight
 */
export async function generateInsight(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    await handleGenerate(req, res, {
      feature: "ai_insight",
      successMessage: "Your insight is ready",
      logSignals: userId ? await loadInsightLogSignals(userId) : undefined,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Record feedback on a previous AI response.
 * POST /api/ai/feedback
 */
export async function submitAiFeedback(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = aiFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Invalid feedback payload", parsed.error.flatten().fieldErrors);
      return;
    }

    // A member may only rate their own AI output. Cross-user feedback is a bug,
    // not a UX problem, so it is rejected outright.
    const ownsRequest = await AiAuditLog.count({
      where: { requestId: parsed.data.requestId, userId },
    });
    if (ownsRequest === 0) {
      aiLog.warn(
        `Rejected feedback for request ${parsed.data.requestId}: no matching AI record for this user.`
      );
      sendError(res, 404, "We could not find that AI response on your account.");
      return;
    }

    const outcome = await recordAiFeedback({
      userId,
      requestId: parsed.data.requestId,
      feature: parsed.data.feature,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });

    // `recordAiFeedback` returns `recorded: false` when it had nowhere to write
    // (no DATABASE_URL configured). Reporting that as 201 told the member their
    // concern was logged when it was not — which is the one thing a "Report
    // Concern" button must never do.
    if (!outcome.recorded) {
      aiLog.error("AI feedback could not be persisted", {
        userId,
        requestId: parsed.data.requestId,
      });
      sendError(
        res,
        503,
        "We could not save your feedback just now. Please try again shortly."
      );
      return;
    }

    sendSuccess(res, 201, "Thank you — your feedback has been recorded", outcome);
  } catch (error) {
    next(error);
  }
}

/**
 * AI Gateway operational health.
 * GET /api/ai/health  (admin / developer only)
 *
 * Reports version stamps, engine reachability and routing. Never returns URLs,
 * API keys or any credential. It does name the configured model id for a
 * failing engine, because "status 400" is not actionable on its own — the
 * operator's next step is to change the id, and only this restricted surface
 * is where that comparison belongs.
 */
export async function getAiHealth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== "admin" && role !== "developer") {
      sendError(res, 403, "This area is restricted to HerCompass staff.");
      return;
    }

    const providers = await getProviderHealth();

    sendSuccess(res, 200, "AI Gateway health retrieved", {
      enabled: AI_GATEWAY_CONFIG.enabled,
      versions: AI_GATEWAY_CONFIG.versions,
      providers,
      routing: describeRouting(),
      prompts: listPromptBundles(),
      confidence: {
        weights: AI_GATEWAY_CONFIG.confidence.weights,
        thresholds: AI_GATEWAY_CONFIG.confidence.thresholds,
      },
    });
  } catch (error) {
    next(error);
  }
}
