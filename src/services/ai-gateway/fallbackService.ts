import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import {
  buildApprovedPatternBlock,
  finiteScore,
} from "./approvedPhrases.js";
import { isCitableRecord } from "./evidenceService.js";
import type {
  GatewayCitation,
  GatewayContext,
  GatewayConfidence,
  GatewayNextStep,
  GatewayRecommendation,
  GatewayTrendSignals,
  PartnerDigestOutput,
  PersonalSnapshotOutput,
} from "../../ai/types/index.js";

/**
 * Deterministic safe fallback.
 *
 * When generation or validation fails, the Gateway still owes the member
 * something useful — but never model-authored content. Every string below is a
 * reviewed constant or a direct restatement of the deterministic context, and
 * every recommendation cites the approved evidence it was derived from.
 *
 * If no approved evidence was retrieved there is nothing safe to say, so the
 * caller receives a retryable failure instead of a hollow Snapshot.
 */

interface ActionTemplate {
  topicArea: string;
  what: string;
  start: string;
  category: string;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    topicArea: "sleep_pattern",
    what: "Keep a consistent wake time and protect a short, screen-free wind-down window before bed.",
    start: "Pick one wake time and repeat it for five days.",
    category: "Sleep & Rest",
  },
  {
    topicArea: "mood_pattern",
    what: "Add a brief daily check-in to name what you are feeling before the day fills up.",
    start: "Write three words about your mood each morning.",
    category: "Emotional Wellbeing",
  },
  {
    topicArea: "energy_pattern",
    what: "Pair your largest task with your highest-energy part of the day.",
    start: "Note when your energy peaks for three days.",
    category: "Energy & Movement",
  },
  {
    topicArea: "symptom_pattern",
    what: "Log the symptoms you notice and what you were doing at the time.",
    start: "Add one entry today, even if it feels minor.",
    category: "Symptom Awareness",
  },
  {
    topicArea: "lifestyle",
    what: "Aim for one consistent eating and movement routine rather than a strict plan.",
    start: "Anchor one meal and one movement break to the same time each day.",
    category: "Nutrition & Routine",
  },
];

const DEFAULT_TEMPLATE: ActionTemplate = {
  topicArea: "lifestyle",
  what: "Build one small, repeatable routine around the area you most want to change.",
  start: "Choose a single action and repeat it for a week.",
  category: "Routine & Rhythm",
};

function asNumber(value: unknown): number | null {
  return finiteScore(value);
}

function templateFor(topicAreas: string[]): ActionTemplate {
  for (const area of topicAreas) {
    const match = ACTION_TEMPLATES.find((template) => template.topicArea === area);
    if (match) return match;
  }
  return DEFAULT_TEMPLATE;
}

function focusAreaSentence(context: GatewayContext): string {
  const focus = context.deterministic.metrics.dominantFocusArea;
  if (typeof focus === "string" && focus.trim() !== "") {
    return `Based on what you shared, your current focus area is ${focus}.`;
  }
  return "Based on what you shared, we are still getting a clear picture of your current baseline.";
}

/**
 * Restates a verified trend in approved, non-diagnostic language.
 *
 * This is the same discipline the model prompt imposes, applied to constants:
 * the fallback may quote a direction the Trend Engine already calculated, and it
 * may say nothing about a domain whose series was too thin to calculate.
 */
function trendSentence(label: string, domain: GatewayTrendSignals["symptoms"]): string {
  if (!domain.sufficientData) {
    return `There is not yet enough logged ${label} data in this window to describe a change.`;
  }

  const direction =
    domain.trend === "increasing"
      ? "has been higher in the more recent part of this window"
      : domain.trend === "decreasing"
        ? "has been lower in the more recent part of this window"
        : "has stayed broadly similar across this window";

  const average =
    domain.recentAverage === null
      ? ""
      : ` (recent logged average ${domain.recentAverage})`;

  return `Your logged ${label} ${direction}${average}. This is an observation from your own check-ins, not a diagnosis.`;
}

function trendObservations(context: GatewayContext): string[] {
  const trend = context.trend;
  if (!trend) return [];

  if (trend.insufficientData) {
    return [
      `You have logged entries on ${trend.daysWithAnyEntry} of the last ${trend.rangeDays} days. A few more check-ins will let your descriptive trends settle.`,
    ];
  }

  return [
    trendSentence("symptom entries", trend.symptoms),
    trendSentence("mood", trend.mood),
    trendSentence("sleep", trend.sleep),
    trendSentence("energy", trend.energy),
  ];
}

/**
 * Recommendations written by software from the cards retrieved for this request.
 *
 * Each line cites that card's real id. Used when the model's own recommendations
 * were removed because their citation ids were not in the retrieved list.
 */
export function recommendationsFromEvidence(context: GatewayContext): GatewayRecommendation[] {
  return context.evidence
    .filter((item) => item.record.status === "approved" && isCitableRecord(item.record))
    .slice(0, AI_GATEWAY_CONFIG.limits.maxRecommendations)
    .map((item) => {
      const template = templateFor(item.record.topicAreas);
      return {
        what: template.what,
        why: `${focusAreaSentence(context)} This suggestion is drawn from ${item.record.sourceName}.`,
        start: template.start,
        category: template.category,
        citationIds: [item.record.citationId],
      };
    });
}

export function buildSnapshotFallback(
  context: GatewayContext,
  citations: GatewayCitation[],
  confidence: GatewayConfidence
): PersonalSnapshotOutput | null {
  if (context.evidence.length === 0) return null;

  const reported = context.reportedAreas;

  const recommendations = recommendationsFromEvidence(context);

  const nextSteps: GatewayNextStep[] = [
    { horizon: "today", action: "Log one entry for symptoms, mood, sleep or energy." },
    { horizon: "this_week", action: "Repeat your daily check-in for five days." },
    { horizon: "track", action: "Watch one signal and note what changes it." },
  ];

  const partnerSupport =
    context.partnerScope.length > 0 && citations.length > 0
      ? {
        suggestedApproach:
          "Ask what support would be welcome today rather than assuming what is needed.",
        shareIdea: "You may want to share which area you would like help with first.",
        citationIds: [citations[0].citationId],
      }
      : null;

  return {
    snapshotVersion: AI_GATEWAY_CONFIG.versions.config,
    symptomPattern: buildApprovedPatternBlock("your symptom pattern", asNumber(context.deterministic.metrics.symptomBurdenScore), reported),
    moodPattern: buildApprovedPatternBlock("your emotional wellbeing", asNumber(context.deterministic.metrics.emotionalBalanceScore), []),
    sleepPattern: buildApprovedPatternBlock("your sleep experience", asNumber(context.deterministic.metrics.sleepDisturbanceScore), []),
    energyPattern: buildApprovedPatternBlock("your energy levels", asNumber(context.deterministic.metrics.vitalityIndex), []),
    lifestyleObservations: [focusAreaSentence(context), ...trendObservations(context)],
    personalizedRecommendations: recommendations,
    suggestedNextSteps: nextSteps,
    partnerSupportOpportunity: partnerSupport,
    evidence: citations,
    confidence,
    safetyStatus: "approved",
    safetyNotice: AI_GATEWAY_CONFIG.safetyNotice,
  };
}

export function buildDigestFallback(
  context: GatewayContext,
  citations: GatewayCitation[],
  confidence: GatewayConfidence
): PartnerDigestOutput | null {
  if (context.evidence.length === 0) return null;

  const source = context.evidence[0].record;

  return {
    digestVersion: AI_GATEWAY_CONFIG.versions.config,
    whatSheMayBeExperiencing: `Based on what she has chosen to share, ${source.sourceName} guidance on ${source.title.toLowerCase()} may be a useful reference. This is not a diagnosis or a medical report.`,
    whatMayHelp: context.evidence
      .slice(0, 3)
      .map((item) => templateFor(item.record.topicAreas).what),
    howToCommunicate: [
      "Ask an open question about what support would be welcome right now.",
      "Reflect back what you heard without offering solutions immediately.",
      "Agree on one small action rather than a plan.",
    ],
    whatToAvoid: [
      "Avoid diagnosing or naming a condition.",
      "Avoid pressing for details she has chosen not to share.",
    ],
    oneSimpleSupportAction: "Ask her one open question today and listen to the answer.",
    evidence: citations,
    confidence,
    safetyStatus: "approved",
    safetyNotice: AI_GATEWAY_CONFIG.safetyNotice,
  };
}
