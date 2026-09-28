import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import type {
  GatewayCitation,
  GatewayContext,
  GatewayConfidence,
  GatewayNextStep,
  GatewayPatternBlock,
  GatewayRecommendation,
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function band(score: number | null): string {
  if (score === null) return "has not been calculated yet";
  if (score >= 70) return "is one of the areas your responses most highlighted";
  if (score >= 40) return "is an area you may want to explore";
  return "is currently among the steadier areas in your responses";
}

function patternBlock(
  label: string,
  score: number | null,
  reportedAreas: string[]
): GatewayPatternBlock {
  const areas =
    reportedAreas.length > 0
      ? ` You reported: ${reportedAreas.slice(0, 5).join(", ")}.`
      : "";

  return {
    summary: `Based on what you shared, ${label} ${band(score)}.${areas} This is an observation, not a diagnosis.`,
    reportedAreas: reportedAreas.slice(0, 8),
    impact: null,
  };
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

export function buildSnapshotFallback(
  context: GatewayContext,
  citations: GatewayCitation[],
  confidence: GatewayConfidence
): PersonalSnapshotOutput | null {
  if (context.evidence.length === 0) return null;

  const reported = context.reportedAreas;

  const recommendations: GatewayRecommendation[] = context.evidence
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
    symptomPattern: patternBlock("your symptom pattern", asNumber(context.deterministic.metrics.symptomBurdenScore), reported),
    moodPattern: patternBlock("your emotional wellbeing", asNumber(context.deterministic.metrics.emotionalBalanceScore), []),
    sleepPattern: patternBlock("your sleep experience", asNumber(context.deterministic.metrics.sleepDisturbanceScore), []),
    energyPattern: patternBlock("your energy levels", asNumber(context.deterministic.metrics.vitalityIndex), []),
    lifestyleObservations: [focusAreaSentence(context)],
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
