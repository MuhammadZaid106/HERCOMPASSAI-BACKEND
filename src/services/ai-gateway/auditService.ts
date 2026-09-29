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
 *
 * A single bounded retry is allowed on rule 1: against a pooler-backed database a
 * write can fail because the pooled socket was closed while the request was
 * waiting on a model, not because the write was rejected. Losing an audit record
 * is a compliance gap, and this is the one failure here that is both likely and
 * cheap to recover from.
 */

const auditLog = logger.module("AI-AUDIT");

export interface AuditInput {
  provenance: GatewayProvenance;
  userId: string;
  userRole: string;
  promptChecksum: string | null;
  confidenceScore: number | null;
}

/**
 * Connection codes that mean "the pooled connection was gone", not "the write was
 * rejected".
 *
 * This is specific to a pooler-backed database. Neon (and any pgbouncer in front
 * of Postgres) closes server-side connections on its own schedule, so a client
 * that has been sitting on an idle connection discovers the socket is dead only
 * when it next uses it — and pg reports that as "Connection terminated
 * unexpectedly". The write itself is perfectly valid and succeeds immediately on
 * a fresh connection, which is why retrying is correct here and a genuine
 * constraint violation is not retried.
 */
const RETRYABLE_CONNECTION_CODES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "40001", // serialization_failure
  "53300", // too_many_connections
]);

const CONNECTION_TERMINATED = "Connection terminated unexpectedly";

function isRetryableConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const candidates = [
    error as { code?: unknown },
    (error as { original?: { code?: unknown } }).original,
    (error as { parent?: { code?: unknown } }).parent,
  ];

  for (const candidate of candidates) {
    const code = candidate?.code;
    if (typeof code === "string" && RETRYABLE_CONNECTION_CODES.has(code)) return true;
  }

  // pg raises this without a SQLSTATE on a pooled socket the server has closed.
  return error.message.includes(CONNECTION_TERMINATED);
}

export async function recordAiAudit(input: AuditInput): Promise<void> {
  const { provenance } = input;

  if (env.DATABASE_URL.trim() === "") {
    auditLog.debug(
      `Skipping AI audit persistence (no DATABASE_URL). request=${provenance.requestId} status=${provenance.resultStatus}`
    );
    return;
  }

  const record = {
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
  };

  // Two attempts, no backoff: a terminated connection is replaced on the retry,
  // and the whole window is a few hundred milliseconds. Bounded, because an audit
  // write must never be the reason a request hangs.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await AiAuditLog.create(record);
      return;
    } catch (error) {
      if (attempt < 2 && isRetryableConnectionError(error)) {
        auditLog.warn(
          `AI audit connection for request ${provenance.requestId} was terminated. Retrying once on a fresh connection.`
        );
        continue;
      }
      auditLog.error(
        `Failed to persist AI audit record for request ${provenance.requestId}. The response is unaffected.`,
        error instanceof Error ? error.message : undefined
      );
      return;
    }
  }
}
