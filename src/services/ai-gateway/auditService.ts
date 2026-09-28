import { AiAuditLog } from "../../models/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { GatewayProvenance } from "../../ai/types/index.js";

/**
 * AI audit logging (spec Step 25).
 *
 * Every AI interaction is traceable: request, user, feature, engine, versions,
 * outcome, confidence and safety status.
 *
 * Two rules govern this file:
 *   1. Auditing must never break the request path. A logging failure is swallowed
 *      and reported, never propagated to the member.
 *   2. Raw prompts, raw completions and health data are not stored. Only
 *      provenance metadata, citation identifiers and SCI finding codes.
 */

const auditLog = logger.module("AI-AUDIT");

export interface AuditInput {
  provenance: GatewayProvenance;
  userId: string;
  userRole: string;
  promptChecksum: string | null;
  confidenceScore: number | null;
}

export async function recordAiAudit(input: AuditInput): Promise<void> {
  const { provenance } = input;

  if (env.DATABASE_URL.trim() === "") {
    auditLog.debug(
      `Skipping AI audit persistence (no DATABASE_URL). request=${provenance.requestId} status=${provenance.resultStatus}`
    );
    return;
  }

  try {
    await AiAuditLog.create({
      requestId: provenance.requestId,
      userId: input.userId,
      userRole: input.userRole,
      feature: provenance.feature,
      provider: provenance.provider,
      model: provenance.model,
      modelVersion: provenance.modelVersion,
      promptVersion: provenance.promptVersion,
      promptChecksum: input.promptChecksum,
      evidenceVersion: provenance.evidenceVersion,
      sciVersion: provenance.sciVersion,
      configVersion: provenance.configVersion,
      resultStatus: provenance.resultStatus,
      confidence: provenance.confidence,
      confidenceScore: input.confidenceScore,
      safetyStatus: provenance.safetyStatus,
      latencyMs: provenance.latencyMs,
      attemptCount: provenance.attemptCount,
      fallbackUsed: provenance.fallbackUsed,
      citationIds: provenance.citations,
      sciFindingCodes: Array.from(
        new Set(provenance.sciFindings.map((finding) => `${finding.check}:${finding.severity}`))
      ),
    });
  } catch (error) {
    auditLog.error(
      `Failed to persist AI audit record for request ${provenance.requestId}. The response is unaffected.`,
      error instanceof Error ? error.message : undefined
    );
  }
}
