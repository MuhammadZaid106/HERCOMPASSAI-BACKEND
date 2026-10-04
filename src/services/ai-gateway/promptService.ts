import { getPromptBundle, renderTemplate, type PromptBundle } from "../../ai/prompts/index.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { logger } from "../../utils/logger.js";
import type {
  GatewayContext,
  GatewayDomainTrend,
  ModelMessage,
  RetrievedEvidence,
} from "../../ai/types/index.js";

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

function textSignal(context: GatewayContext, key: string): string {
  const value = context.deterministic.metrics[key];
  return typeof value === "string" ? value : "";
}

function formatList(values: string[], emptyLabel: string): string {
  if (values.length === 0) return emptyLabel;
  return values.map((value) => `- ${value}`).join("\n");
}

function formatSignals(signals: string[]): string {
  return signals.length > 0 ? signals.join(", ") : "none";
}

/**
 * Renders the verified Trend Engine output.
 *
 * The block is written as plain, already-calculated sentences and figures. The
 * model is told explicitly what it may and may not do with it, because "your
 * mood decreased 12%" is the single easiest thing for a language model to
 * produce from a trend, and it is the fastest way to publish a number HerCompass
 * cannot trace.
 */
function formatTrendBlock(context: GatewayContext): string {
  const trend = context.trend;
  if (!trend) return "[no tracking data available yet]";

  if (trend.insufficientData) {
    return [
      `insufficient_data: true`,
      `days_logged: ${trend.daysWithAnyEntry} of ${trend.rangeDays}`,
      `check_in_streak_days: ${trend.checkInStreak}`,
      `No directional trend has been calculated. Do not describe any change over time, and do not state an average for any domain.`,
    ].join("\n");
  }

  const domain = (name: string, value: GatewayDomainTrend): string[] => {
    const lines = [
      `${name}_trend: ${value.trend}`,
      `${name}_recent_average: ${value.recentAverage ?? "not available"}`,
      `${name}_prior_average: ${value.priorAverage ?? "not available"}`,
    ];
    if (value.changePercent !== null) lines.push(`${name}_change_percent: ${value.changePercent}`);
    if (!value.sufficientData) lines.push(`${name}_sufficiency: insufficient — do not describe this domain as changing`);
    return lines;
  };

  return [
    `insufficient_data: false`,
    `range_days: ${trend.rangeDays}`,
    `days_logged: ${trend.daysWithAnyEntry}`,
    `consistency_score: ${trend.consistencyScore}`,
    `check_in_streak_days: ${trend.checkInStreak}`,
    `symptom_frequency: ${trend.symptomFrequency ?? "not available"}`,
    ...domain("symptoms", trend.symptoms),
    ...domain("mood", trend.mood),
    ...domain("sleep", trend.sleep),
    ...domain("energy", trend.energy),
    "",
    "verified_pattern_indicators (already calculated — restate or omit, never author new ones):",
    ...(trend.patternIndicators.length > 0
      ? trend.patternIndicators.map((indicator) => `- ${indicator}`)
      : ["- [none calculated]"]),
  ].join("\n");
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
    TREND_ENGINE_VALUES: formatTrendBlock(context),
    SUPPLIED_SIGNALS: formatSignals(context.deterministic.suppliedFields),
    MISSING_SIGNALS: formatSignals(context.deterministic.missingFields),
    CONSISTENT_SIGNALS: formatSignals(context.deterministic.consistentSignals),
    CONFLICTING_SIGNALS: formatSignals(context.deterministic.conflictingSignals),
    REPORTED_AREAS: formatList(context.reportedAreas, "[none supplied]"),
    GOALS: formatList(context.goals, "[none supplied]"),
    PARTNER_SUPPORT: context.partnerScope.length > 0 ? context.partnerScope.join(", ") : "not indicated",
    AUTHORIZED_SCOPE: formatList(context.partnerScope, "[none authorized]"),
    MEMBER_FIRST_NAME: textSignal(context, "memberFirstName"),
    PARTNER_TASK: textSignal(context, "partnerTask") || "Write the weekly partner digest.",
    PREMIUM_SECTION: textSignal(context, "premiumSection") || "omit",
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
