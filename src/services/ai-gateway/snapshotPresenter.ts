import type {
  GatewayDegradationDiagnostics,
  GatewayProvenance,
  PersonalSnapshotOutput,
} from "../../ai/types/index.js";

/**
 * Personal Menopause Snapshot™ presentation.
 *
 * The Gateway's `personal_snapshot` contract and the Snapshot the member reads
 * are not the same shape, and the difference is deliberate: the Gateway contract
 * is what SCI validates, while the member view is what a person can read on a
 * phone. This module is the one place that translation happens.
 *
 * It is pure. Nothing here calls a model, reads the database or decides whether
 * a response is safe — by the time a payload arrives it has already cleared
 * schema validation, guardrails, citation verification, confidence, SCI and
 * safety. Rewriting approved content at this layer would undo that work, so
 * every string below is either copied from the approved payload or a reviewed
 * constant.
 */

export const SNAPSHOT_PRESENTATION_VERSION = "1.0";

export interface SnapshotRecommendationView {
  action: string;
  why: string;
  category: string;
  start?: string;
  citationIds?: string[];
}

export interface SnapshotObservationView {
  id: number;
  pillar: string;
  title: string;
  summary?: string;
  score?: number;
  impact?: string;
  evidenceNote?: string;
  vitalityIndex?: number;
  preferences?: string[];
  recommendations?: SnapshotRecommendationView[];
  action?: string;
  status?: string;
  trend?: {
    direction: "increasing" | "decreasing" | "stable";
    recentAverage: number | null;
    priorAverage: number | null;
    changePercent: number | null;
    sufficientData: boolean;
  };
}

export interface SnapshotCitationView {
  citationId: string;
  sourceName: string;
  title: string;
  publisher: string;
  publicationDate: string;
  reference: string;
  authorityLevel: number;
}

export interface SnapshotGenerationView {
  requestId: string;
  resultStatus: GatewayProvenance["resultStatus"];
  fallbackUsed: boolean;
  confidenceClass: string | null;
  confidenceScore: number | null;
  safetyStatus: GatewayProvenance["safetyStatus"];
  promptVersion: string;
  evidenceVersion: string;
  sciVersion: string;
  modelVersion: string | null;
  /**
   * Why the AI part could not run, and whether a retry is worth attempting.
   *
   * Absent on a clean, approved result. The member-facing view shows this next to
   * the "written by the AI assistant" line, so a Snapshot that quietly fell back
   * is visibly different from one the model wrote.
   */
  diagnostics?: GatewayDegradationDiagnostics;
}

export interface PresentedSnapshot {
  presentationVersion: string;
  member: { name: string; plan: string };
  completedAt: string;
  version: string;
  observations: SnapshotObservationView[];
  safetyNotice: string;
  citations: SnapshotCitationView[];
  generation: SnapshotGenerationView;
  confidence: {
    confidenceClass: string | null;
    confidenceScore: number | null;
    rationale: string[];
  };
}

export interface PresentSnapshotParams {
  output: PersonalSnapshotOutput;
  provenance: GatewayProvenance;
  member: { name: string; plan: string };
  completedAt: Date | string | null;
  profileVersion: string;
  /** Verified Trend Engine values, when the request had them. */
  trend?: {
    symptoms: TrendDomain;
    mood: TrendDomain;
    sleep: TrendDomain;
    energy: TrendDomain;
  } | null;
  /**
   * Member-safe degradation record from the Gateway, when the result was
   * degraded. Omitted on a clean result so an approved Snapshot carries no
   * failure vocabulary.
   */
  diagnostics?: GatewayDegradationDiagnostics;
}

interface TrendDomain {
  trend: "increasing" | "decreasing" | "stable";
  recentAverage: number | null;
  priorAverage: number | null;
  changePercent: number | null;
  sufficientData: boolean;
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/** Renames the Trend Engine's `trend` to a member-facing `direction`. */
function trendView(domain: TrendDomain): SnapshotObservationView["trend"] {
  return {
    direction: domain.trend,
    recentAverage: domain.recentAverage,
    priorAverage: domain.priorAverage,
    changePercent: domain.changePercent,
    sufficientData: domain.sufficientData,
  };
}

/**
 * A citation line the member can actually follow.
 *
 * Source, title and link are stored, and the Gateway has already verified that
 * each record is approved, so presenting the reference is presenting the
 * evidence — not a model's paraphrase of it.
 */
function citationNote(citationIds: string[] | undefined, output: PersonalSnapshotOutput): string | undefined {
  if (!citationIds || citationIds.length === 0) return undefined;

  const titles = citationIds
    .map((id) => output.evidence.find((citation) => citation.citationId === id)?.title)
    .filter((title): title is string => typeof title === "string" && title.trim() !== "");

  if (titles.length === 0) return undefined;
  return `Grounded in: ${titles.join("; ")}`;
}

function observation(
  id: number,
  pillar: string,
  title: string,
  fields: Omit<SnapshotObservationView, "id" | "pillar" | "title">
): SnapshotObservationView {
  return { id, pillar, title, ...fields };
}

/**
 * The 8-part Snapshot the member reads.
 *
 * The gateway contract is a set of pattern blocks, recommendations, next steps
 * and a partner opportunity. Ordering them into eight numbered sections is a
 * presentation decision, so it lives here rather than in the gateway, and the
 * section titles are constants rather than model output — a model that renamed
 * "Sleep Architecture" to something else would silently break the page layout.
 */
export function presentSnapshot(params: PresentSnapshotParams): PresentedSnapshot {
  const { output, provenance } = params;
  const trend = params.trend ?? null;

  const observation_1 = observation(1, "Symptom Pattern", "Primary Observed Concerns", {
    summary: output.symptomPattern.summary,
    impact: output.symptomPattern.impact ?? undefined,
    trend: trend ? trendView(trend.symptoms) : undefined,
  });

  const observation_2 = observation(2, "Mood & Emotional Baseline", "Emotional Wellbeing Rhythm", {
    summary: output.moodPattern.summary,
    trend: trend ? trendView(trend.mood) : undefined,
  });

  const observation_3 = observation(3, "Sleep Architecture", "Restorative Sleep Pattern", {
    summary: output.sleepPattern.summary,
    trend: trend ? trendView(trend.sleep) : undefined,
  });

  const observation_4 = observation(4, "Energy & Metabolic Rhythm", "Daily Energy Distribution", {
    summary: output.energyPattern.summary,
    trend: trend ? trendView(trend.energy) : undefined,
  });

  const observation_5 = observation(5, "Lifestyle & Nutrition Context", "Nutrition & Movement Baseline", {
    summary: output.lifestyleObservations.join(" ") || output.energyPattern.summary,
  });

  const observation_6 = observation(6, "Personalized Recommendations", "Your Evidence-Informed Steps", {
    recommendations: output.personalizedRecommendations.slice(0, 5).map((recommendation) => ({
      action: recommendation.what,
      why: recommendation.why,
      category: recommendation.category,
      start: recommendation.start,
    })),
    evidenceNote: citationNote(
      output.personalizedRecommendations.flatMap((recommendation) => recommendation.citationIds),
      output
    ),
  });

  const observation_7 = observation(7, "Suggested Next Steps", "Where To Start This Week", {
    action: output.suggestedNextSteps.map((step) => step.action).join("  •  "),
  });

  const partner = output.partnerSupportOpportunity;
  const observation_8 = observation(8, "Partner Support Opportunity", "Couple & Partner Intelligence", {
    status: partner ? "Available on request" : "Optional / Private",
    summary: partner
      ? `${partner.suggestedApproach} ${partner.shareIdea}`
      : "Partner sharing is currently private. You can invite a trusted partner whenever you choose.",
    evidenceNote: partner ? citationNote(partner.citationIds, output) : undefined,
  });

  return {
    presentationVersion: SNAPSHOT_PRESENTATION_VERSION,
    member: params.member,
    completedAt:
      params.completedAt instanceof Date
        ? params.completedAt.toISOString()
        : (params.completedAt ?? new Date().toISOString()),
    version: asText(params.profileVersion, "1.0"),
    observations: [
      observation_1,
      observation_2,
      observation_3,
      observation_4,
      observation_5,
      observation_6,
      observation_7,
      observation_8,
    ],
    safetyNotice: output.safetyNotice,
    citations: output.evidence.map((citation) => ({
      citationId: citation.citationId,
      sourceName: citation.sourceName,
      title: citation.title,
      publisher: citation.publisher,
      publicationDate: citation.publicationDate,
      reference: citation.urlOrIdentifier,
      authorityLevel: citation.authorityLevel,
    })),
    generation: {
      requestId: provenance.requestId,
      resultStatus: provenance.resultStatus,
      fallbackUsed: provenance.fallbackUsed,
      confidenceClass: provenance.confidence,
      confidenceScore: output.confidence.confidenceScore,
      safetyStatus: provenance.safetyStatus,
      promptVersion: provenance.promptVersion,
      evidenceVersion: provenance.evidenceVersion,
      sciVersion: provenance.sciVersion,
      modelVersion: provenance.modelVersion,
      diagnostics: params.diagnostics,
    },
    confidence: {
      confidenceClass: output.confidence.confidenceClass,
      confidenceScore: output.confidence.confidenceScore,
      rationale: output.confidence.rationale,
    },
  };
}

/**
 * Deterministic scores the Snapshot cards display.
 *
 * Read from the same bag the Gateway assembled, so a figure on a card and a
 * figure in the prompt are the same value by construction. Absent values render
 * as `null` rather than a fabricated default — a placeholder score is a number
 * the member has no way to distinguish from a calculated one.
 */
export function presentDeterministicMetrics(
  metrics: Record<string, unknown>
): Record<string, number | string | null> {
  const pick = (key: string): number | string | null => {
    const value = metrics[key];
    if (typeof value === "number" || typeof value === "string") return value;
    return null;
  };

  return {
    symptomBurdenScore: pick("symptomBurdenScore"),
    sleepDisturbanceScore: pick("sleepDisturbanceScore"),
    vitalityIndex: pick("vitalityIndex"),
    emotionalBalanceScore: pick("emotionalBalanceScore"),
    dominantFocusArea: pick("dominantFocusArea"),
    trendRangeDays: pick("trend.rangeDays"),
    trendDaysLogged: pick("trend.daysWithAnyEntry"),
    trendConsistencyScore: pick("trend.consistencyScore"),
    trendCheckInStreak: pick("trend.checkInStreak"),
  };
}
