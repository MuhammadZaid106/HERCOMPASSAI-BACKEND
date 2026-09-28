import { getPromptBundle, renderTemplate, type PromptBundle } from "../../ai/prompts/index.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { logger } from "../../utils/logger.js";
import type { GatewayContext, ModelMessage, RetrievedEvidence } from "../../ai/types/index.js";

const promptLog = logger.module("AI-PROMPTS");

/**
 * Prompt assembly.
 *
 * Prompts are versioned artifacts (Step 20), not inline strings. The Gateway
 * renders a stored template with server-derived context and records the bundle
 * version and checksum on the AI event, so any output can be reproduced.
 */

export interface AssembledPrompt {
  bundle: PromptBundle;
  messages: ModelMessage[];
  promptVersion: string;
  promptChecksum: string;
  contextChars: number;
}

function formatMetrics(context: GatewayContext): string {
  const metrics = context.deterministic.metrics;
  if (Object.keys(metrics).length === 0) return "{}";

  return JSON.stringify(metrics, null, 2);
}

function formatEvidenceBlock(evidence: RetrievedEvidence[]): string {
  if (evidence.length === 0) return "[no approved evidence retrieved]";

  return evidence
    .map((item) => {
      const record = item.record;
      return [
        `citation_id: ${record.citationId}`,
        `source: ${record.sourceName} (${record.sourceCategory})`,
        `title: ${record.title}`,
        `publisher: ${record.publisher}`,
        `published: ${record.publicationDate}`,
        `reference: ${record.urlOrIdentifier}`,
        `authority_level: ${record.authorityLevel}/5`,
        `consensus_level: ${record.consensusLevel}/5`,
        `summary: ${record.summary}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function formatList(values: string[], emptyLabel: string): string {
  if (values.length === 0) return emptyLabel;
  return values.map((value) => `- ${value}`).join("\n");
}

function formatSignals(signals: string[]): string {
  return signals.length > 0 ? signals.join(", ") : "none";
}

export function assemblePrompt(
  context: GatewayContext,
  promptKey: string,
  requestedVersion: string | undefined
): AssembledPrompt {
  const bundle =
    getPromptBundle(promptKey, requestedVersion) ??
    getPromptBundle(promptKey, "v1") ??
    getPromptBundle(promptKey);

  if (!bundle) {
    throw new Error(`No prompt bundle registered for key "${promptKey}"`);
  }

  const isPartnerDigest = context.feature === "partner_digest";

  const userPrompt = renderTemplate(bundle.userTemplate, {
    SNAPSHOT_VERSION: AI_GATEWAY_CONFIG.versions.config,
    DIGEST_VERSION: AI_GATEWAY_CONFIG.versions.config,
    LOCALE: context.locale,
    DETERMINISTIC_METRICS: formatMetrics(context),
    SUPPLIED_SIGNALS: formatSignals(context.deterministic.suppliedFields),
    MISSING_SIGNALS: formatSignals(context.deterministic.missingFields),
    REPORTED_AREAS: formatList(context.reportedAreas, "[none supplied]"),
    GOALS: formatList(context.goals, "[none supplied]"),
    PARTNER_SUPPORT: context.partnerScope.length > 0 ? context.partnerScope.join(", ") : "not indicated",
    AUTHORIZED_SCOPE: formatList(context.partnerScope, "[none authorized]"),
    AUTHORIZED_SIGNALS: formatMetrics(context),
    PARTNER_PREFERENCES: formatList([], "[none supplied]"),
    EVIDENCE_BLOCK: formatEvidenceBlock(context.evidence),
    VALID_CITATION_IDS: context.evidence.map((item) => item.record.citationId).join(", "),
    MAX_RECOMMENDATIONS: AI_GATEWAY_CONFIG.limits.maxRecommendations,
  });

  const systemPrompt = `${bundle.system}\n\n<output_contract>\n${bundle.outputContract}\n</output_contract>`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const contextChars = messages.reduce((total, message) => total + message.content.length, 0);

  if (contextChars > AI_GATEWAY_CONFIG.limits.maxContextChars) {
    promptLog.warn(
      `Assembled context for request ${context.requestId} is ${contextChars} characters, above the configured limit.`
    );
  }

  if (isPartnerDigest) {
    promptLog.info(`Partner digest prompt assembled for request ${context.requestId} using scoped context only.`);
  }

  return {
    bundle,
    messages,
    promptVersion: bundle.version,
    promptChecksum: bundle.checksum,
    contextChars,
  };
}
