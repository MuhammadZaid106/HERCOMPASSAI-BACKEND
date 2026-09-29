import { AI_GATEWAY_CONFIG, getFeaturePolicy } from "../../config/aiGateway.js";
import { OnboardingProfile, User } from "../../models/index.js";
import { retrieveEvidence } from "./evidenceService.js";
import { logger } from "../../utils/logger.js";
import type {
  ConsentScope,
  DeterministicContext,
  DeterministicMetrics,
  GatewayContext,
  GatewayFeature,
} from "../../ai/types/index.js";

const contextLog = logger.module("AI-CONTEXT");

/**
 * Context assembly.
 *
 * The Gateway builds its own context from server-side data. Clients never submit
 * free-form `user_context` for interpretation — a request that could inject
 * fabricated metrics would let a caller fabricate scores, which breaks the
 * "deterministic software calculates" guarantee.
 */

export interface ContextSource {
  profile: OnboardingProfile;
  userName: string | null;
}

export interface AssembleContextParams {
  feature: GatewayFeature;
  userId: string;
  role: GatewayContext["actor"]["role"];
  requestId: string;
  source: ContextSource;
  consent: ConsentScope;
  locale: string;
  promptVersion: string;
  partnerScope?: string[];
  partnerPreferences?: string[];
  /** Partner features receive authorized signals only — never the raw record. */
  authorizedSignals?: Record<string, string | number | boolean | null>;
  /** Trend scalars calculated from daily logs. The model interprets them. */
  logSignals?: Record<string, string | number | boolean>;
}

const FOCUS_HINTS: Record<string, string[]> = {
  symptom_pattern: ["symptom", "menopause", "perimenopause", "vasomotor", "hot flash"],
  mood_pattern: ["mood", "stress", "anxiety", "cbt", "mindfulness", "mental health"],
  sleep_pattern: ["sleep", "insomnia", "routine", "circadian", "activity"],
  energy_pattern: ["energy", "metabolic", "activity", "nutrition", "exercise"],
  lifestyle: ["nutrition", "diet", "activity", "exercise", "lifestyle"],
  partner_support: ["partner", "relationship", "communication", "support", "couples"],
};

/** Topic hints from the deterministic focus area, mapped onto evidence topic areas. */
function topicHintsFor(focusArea: string | null, feature: GatewayFeature): string[] {
  const lowered = (focusArea ?? "").toLowerCase();
  const hints: string[] = [];

  if (lowered.includes("sleep") || lowered.includes("wind-down")) hints.push(...FOCUS_HINTS.sleep_pattern);
  if (lowered.includes("energy") || lowered.includes("metabolic") || lowered.includes("movement")) {
    hints.push(...FOCUS_HINTS.energy_pattern);
  }
  if (lowered.includes("mood") || lowered.includes("nervous") || lowered.includes("breathwork")) {
    hints.push(...FOCUS_HINTS.mood_pattern);
  }
  if (lowered.includes("vasomotor") || lowered.includes("cooling") || lowered.includes("comfort")) {
    hints.push(...FOCUS_HINTS.symptom_pattern);
  }
  if (feature === "partner_digest") hints.push(...FOCUS_HINTS.partner_support);
  if (feature === "personal_snapshot") hints.push(...FOCUS_HINTS.lifestyle);

  return Array.from(new Set(hints));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Deterministic signal reconciliation.
 *
 * A pattern is only "consistent" when independent metrics agree. This feeds the
 * confidence calculation and is intentionally pure — no model input.
 */
function reconcileSignals(metrics: Record<string, unknown>): {
  consistent: string[];
  conflicting: string[];
} {
  const consistent: string[] = [];
  const conflicting: string[] = [];

  const symptom = asNumber(metrics.symptomBurdenScore);
  const sleep = asNumber(metrics.sleepDisturbanceScore);
  const vitality = asNumber(metrics.vitalityIndex);
  const mood = asNumber(metrics.emotionalBalanceScore);

  const present = [symptom, sleep, vitality, mood].filter((value) => value !== null).length;
  if (present === 4) consistent.push("full_signal_coverage");

  if (sleep !== null && vitality !== null) {
    if (sleep >= 60 && vitality < 55) consistent.push("sleep_disturbance_with_low_vitality");
    if (sleep >= 60 && vitality >= 70) conflicting.push("high_energy_reported_despite_sleep_disturbance");
  }

  if (symptom !== null && mood !== null) {
    if (symptom >= 60 && mood < 50) consistent.push("symptom_burden_with_low_emotional_balance");
    if (symptom < 40 && mood < 45) conflicting.push("low_symptom_report_with_low_emotional_balance");
  }

  if (vitality !== null && sleep !== null && vitality < 45 && sleep < 40) {
    consistent.push("stable_sleep_with_low_vitality");
  }

  return { consistent, conflicting };
}

/**
 * Normalises the stored deterministic score blob into a typed context.
 * Only scalar values are carried forward, so a malformed record cannot smuggle
 * nested objects into a prompt.
 */
function buildDeterministicContext(
  rawScores: unknown,
  expectedSignals: string[]
): DeterministicContext {
  const metrics: DeterministicMetrics = {};
  const source =
    rawScores !== null && typeof rawScores === "object" && !Array.isArray(rawScores)
      ? (rawScores as Record<string, unknown>)
      : {};

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) continue;
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      metrics[key] = value;
    }
  }

  const suppliedFields = Object.keys(metrics);
  const missingFields = expectedSignals.filter((field) => metrics[field] === undefined);
  const { consistent, conflicting } = reconcileSignals(metrics);

  return {
    metrics,
    suppliedFields,
    missingFields,
    consistentSignals: consistent,
    conflictingSignals: conflicting,
  };
}

function collectReportedAreas(profile: OnboardingProfile): string[] {
  const areas = new Set<string>();

  for (const area of profile.primaryHealthConcerns ?? []) if (area?.trim()) areas.add(area.trim());
  for (const area of profile.moodPatterns ?? []) if (area?.trim()) areas.add(area.trim());
  for (const area of profile.sleepChallenges ?? []) if (area?.trim()) areas.add(area.trim());
  for (const area of profile.lifestyleFocus ?? []) if (area?.trim()) areas.add(area.trim());
  for (const area of profile.partnerSupportNeeds ?? []) if (area?.trim()) areas.add(area.trim());

  if (profile.menopausePhase) areas.add(`Menopause stage: ${profile.menopausePhase}`);

  return Array.from(areas).slice(0, AI_GATEWAY_CONFIG.limits.maxReportedAreas);
}

function collectGoals(profile: OnboardingProfile): string[] {
  const goals = new Set<string>();

  for (const goal of profile.primaryGoals ?? []) if (goal?.trim()) goals.add(goal.trim());
  if (profile.primaryGoal?.trim()) goals.add(profile.primaryGoal.trim());
  for (const goal of profile.emotionalGoals ?? []) if (goal?.trim()) goals.add(goal.trim());
  for (const goal of profile.preferredRecommendations ?? []) if (goal?.trim()) goals.add(goal.trim());

  return Array.from(goals).slice(0, 8);
}

export function partnerSupportIsRelevant(profile: OnboardingProfile): boolean {
  const interest = profile.partnerSupportInterest;
  return interest === "yes" || interest === "maybe";
}

export function buildContext(params: AssembleContextParams): GatewayContext {
  const policy = getFeaturePolicy(params.feature);
  const expectedSignals = policy?.expectedSignals ?? [];

  const profile = params.source.profile;
  const isPartnerFeature = params.feature === "partner_digest";

  const deterministic = buildDeterministicContext(profile.deterministicScores, expectedSignals);

  // A partner never receives the raw member record. Only authorized signals
  // cross the boundary, and the boundary itself is enforced by authorization
  // in the controller before this function runs.
  const reportedAreas = isPartnerFeature ? [] : collectReportedAreas(profile);
  const goals = isPartnerFeature ? [] : collectGoals(profile);
  const metrics = isPartnerFeature
    ? { ...(params.authorizedSignals ?? {}) }
    : deterministic.metrics;

  const partnerScope = params.partnerScope ?? [];

  const focusArea =
    typeof metrics.dominantFocusArea === "string" ? metrics.dominantFocusArea : null;

  const logSignals = isPartnerFeature ? {} : (params.logSignals ?? {});
  for (const [key, value] of Object.entries(logSignals)) {
    metrics[key] = value;
  }
  const suppliedFields = Array.from(
    new Set([...deterministic.suppliedFields, ...Object.keys(logSignals)]),
  );

  const topicHints = topicHintsFor(focusArea, params.feature);
  if (logSignals.sleepTrend === "decreasing" || logSignals.sleepTrend === "increasing") {
    topicHints.push(...FOCUS_HINTS.sleep_pattern);
  }
  if (logSignals.energyTrend === "decreasing" || logSignals.energyTrend === "increasing") {
    topicHints.push(...FOCUS_HINTS.energy_pattern);
  }
  if (logSignals.moodTrend === "decreasing" || logSignals.moodTrend === "increasing") {
    topicHints.push(...FOCUS_HINTS.mood_pattern);
  }
  if (logSignals.symptomTrend === "increasing") {
    topicHints.push(...FOCUS_HINTS.symptom_pattern);
  }

  const retrieval = retrieveEvidence({
    focusArea,
    goals: [...goals, ...partnerScope],
    reportedAreas,
    topicHints: Array.from(new Set(topicHints)),
  });

  if (retrieval.insufficientEvidence) {
    contextLog.warn(
      `No approved evidence cleared the relevance threshold for feature "${params.feature}" (request ${params.requestId}).`
    );
  }

  const context: GatewayContext = {
    feature: params.feature,
    actor: { userId: params.userId, role: params.role },
    requestId: params.requestId,
    locale: params.locale,
    consent: params.consent,
    deterministic: {
      ...deterministic,
      metrics,
      suppliedFields: isPartnerFeature ? deterministic.suppliedFields : suppliedFields,
      // Partner context completeness is measured against what was shared, not
      // against the member's full assessment.
      missingFields: isPartnerFeature ? [] : deterministic.missingFields,
    },
    goals,
    reportedAreas,
    evidence: retrieval.items,
    evidenceVersion: retrieval.evidenceVersion,
    partnerScope,
  };

  return context;
}

/** Loads the server-side profile the Gateway is permitted to read. */
export async function loadContextSource(userId: string): Promise<ContextSource | null> {
  const profile = await OnboardingProfile.findOne({
    where: { userId },
    attributes: { exclude: ["createdAt", "updatedAt"] },
  });

  if (!profile || !profile.isCompleted) return null;

  const user = await User.findByPk(userId, { attributes: ["name"] });

  return { profile, userName: user?.name ?? null };
}
