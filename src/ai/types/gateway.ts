/**
 * HerCompass AI Gateway — Canonical contract types
 *
 * The Gateway owns: authentication, authorization, request validation, context
 * assembly, evidence retrieval, model selection, prompt selection, guardrails,
 * SCI, citation verification, confidence, safety checks, logging, error handling
 * and fallback behaviour. Nothing outside this boundary talks to a model.
 */

import type { AITaskType, ModelProviderErrorKind, ModelProviderName } from "./provider.js";

/** Feature identifiers the Gateway is allowed to serve. */
export type GatewayFeature =
  | "personal_snapshot"
  | "partner_digest"
  | "ai_insight";

/** Roles permitted to invoke a given feature. Authorization is server-side only. */
export type GatewayActorRole = "member" | "partner" | "admin" | "developer";

/** Approved evidence categories. Arbitrary internet content is never authoritative. */
export type EvidenceCategory =
  | "medical"
  | "nutrition"
  | "behavioral_mental_health"
  | "academic"
  | "internal_clinical";

export type EvidenceAuthorityLevel = 1 | 2 | 3 | 4 | 5;
export type EvidenceConsensusLevel = 1 | 2 | 3 | 4 | 5;
export type EvidenceStatus = "approved" | "in_review" | "retired";

/**
 * An approved evidence record (spec Step 12). Only `status: "approved"` records
 * may be retrieved into model context.
 */
export interface EvidenceRecord {
  evidenceId: string;
  citationId: string;
  sourceName: string;
  sourceCategory: EvidenceCategory;
  title: string;
  publisher: string;
  publicationDate: string;
  urlOrIdentifier: string;
  evidenceType: string;
  authorityLevel: EvidenceAuthorityLevel;
  consensusLevel: EvidenceConsensusLevel;
  recencyScore: number;
  status: EvidenceStatus;
  reviewedAt: string;
  reviewedBy: string;
  version: string;
  /** Clinical summary used to ground generation. */
  summary: string;
  /** Retrieval keywords — deterministic lexical matching, no free-form internet input. */
  keywords: string[];
  /** Applies to these symptom/goal areas; empty means generally applicable. */
  topicAreas: string[];
}

/** A retrieved evidence item plus its deterministic retrieval score. */
export interface RetrievedEvidence {
  record: EvidenceRecord;
  relevanceScore: number;
  matchedKeywords: string[];
}

/**
 * Deterministic calculations produced by application software
 * (`IntelligenceCalculationService`). The LLM never computes these values —
 * it only interprets them (spec: "Deterministic Software Calculates").
 */
export interface DeterministicMetrics {
  [key: string]: number | string | boolean | null | undefined;
}

export interface DeterministicContext {
  metrics: DeterministicMetrics;
  /** Field names the caller supplied, used for the data-completeness signal. */
  suppliedFields: string[];
  /** Field names the pipeline expected but did not receive. */
  missingFields: string[];
  /** Signals the deterministic engine reported as internally consistent. */
  consistentSignals: string[];
  /** Signals that conflict and reduce pattern-consistency confidence. */
  conflictingSignals: string[];
}

/**
 * One verified per-domain trend, exactly as the Deterministic Trend Engine
 * calculated it. The model may describe this; it may never recompute it.
 */
export interface GatewayDomainTrend {
  trend: "increasing" | "decreasing" | "stable";
  changePercent: number | null;
  recentAverage: number | null;
  priorAverage: number | null;
  sufficientData: boolean;
}

/**
 * Verified Trend Engine output presented to the model for interpretation
 * (spec: "Verified calculations passed to the AI for interpretation").
 *
 * This is the only member-derived time-series data the model receives. It is
 * already calculated, already reconciled, and carries its own sufficiency
 * flags, so the model can say "your logged mood average moved lower" without
 * ever seeing a mood row, a free-text note or a raw timestamp.
 */
export interface GatewayTrendSignals {
  rangeDays: number;
  /** True when too few days were logged for the series to mean anything. */
  insufficientData: boolean;
  daysWithAnyEntry: number;
  consistencyScore: number;
  checkInStreak: number;
  symptomFrequency: number | null;
  symptoms: GatewayDomainTrend;
  mood: GatewayDomainTrend;
  sleep: GatewayDomainTrend;
  energy: GatewayDomainTrend;
  /** Pre-computed descriptive indicators. The model restates these; it does not author them. */
  patternIndicators: string[];
}

/** Consent scope governing what may enter AI context. */
export interface ConsentScope {
  consentId: string;
  consentType: string;
  consentVersion: string;
  status: "granted" | "revoked";
}

/** Everything the Gateway is permitted to show the model for one request. */
export interface GatewayContext {
  feature: GatewayFeature;
  actor: {
    userId: string;
    role: GatewayActorRole;
  };
  requestId: string;
  locale: string;
  consent: ConsentScope;
  deterministic: DeterministicContext;
  /** Verified Trend Engine output, or null when no data has been logged. */
  trend: GatewayTrendSignals | null;
  goals: string[];
  reportedAreas: string[];
  evidence: RetrievedEvidence[];
  evidenceVersion: string;
  /** Partner features must never receive raw member records — scope is enforced upstream. */
  partnerScope: string[];
}

/** A single citation attached to approved output. */
export interface GatewayCitation {
  citationId: string;
  evidenceId: string;
  sourceName: string;
  sourceCategory: EvidenceCategory;
  title: string;
  publisher: string;
  publicationDate: string;
  urlOrIdentifier: string;
  authorityLevel: EvidenceAuthorityLevel;
  consensusLevel: EvidenceConsensusLevel;
  recencyScore: number;
  relevanceScore: number;
  verified: boolean;
}

export interface GatewayRecommendation {
  what: string;
  why: string;
  start: string;
  category: string;
  citationIds: string[];
}

export interface GatewayNextStep {
  horizon: "today" | "this_week" | "track";
  action: string;
}

export interface GatewayPatternBlock {
  summary: string;
  reportedAreas: string[];
  impact: string | null;
}

export interface GatewayPartnerSupport {
  suggestedApproach: string;
  shareIdea: string;
  citationIds: string[];
}

/** Deterministic confidence classification. The model may not supply these values. */
export type ConfidenceClass = "high" | "moderate" | "limited";

export interface GatewayConfidence {
  confidenceClass: ConfidenceClass;
  confidenceScore: number;
  components: {
    evidenceStrength: number;
    dataCompleteness: number;
    patternConsistency: number;
    modelEvaluation: number;
  };
  rationale: string[];
}

/** The 8-part Personal Menopause Snapshot™ output contract (spec Step 42). */
export interface PersonalSnapshotOutput {
  snapshotVersion: string;
  symptomPattern: GatewayPatternBlock;
  moodPattern: GatewayPatternBlock;
  sleepPattern: GatewayPatternBlock;
  energyPattern: GatewayPatternBlock;
  lifestyleObservations: string[];
  personalizedRecommendations: GatewayRecommendation[];
  suggestedNextSteps: GatewayNextStep[];
  partnerSupportOpportunity: GatewayPartnerSupport | null;
  evidence: GatewayCitation[];
  confidence: GatewayConfidence;
  safetyStatus: "approved";
  safetyNotice: string;
}

/** Partner Digest output contract (spec Step 58). */
export interface PartnerDigestOutput {
  digestVersion: string;
  whatSheMayBeExperiencing: string;
  whatMayHelp: string[];
  howToCommunicate: string[];
  whatToAvoid: string[];
  oneSimpleSupportAction: string;
  evidence: GatewayCitation[];
  confidence: GatewayConfidence;
  safetyStatus: "approved";
  safetyNotice: string;
}

export type GatewayOutput = PersonalSnapshotOutput | PartnerDigestOutput;

export type GatewayResultStatus =
  | "approved"
  | "approved_with_repairs"
  | "fallback"
  | "blocked";

export type GatewaySafetyStatus =
  | "pass"
  | "pass_with_warnings"
  | "blocked";

/** One SCI finding. Findings are always logged, never silently dropped. */
export interface SciFinding {
  check:
    | "response_schema"
    | "required_sections"
    | "non_diagnostic_language"
    | "medical_risk_language"
    | "citation_presence"
    | "citation_validity"
    | "evidence_support"
    | "unsafe_content"
    | "numeric_grounding"
    | "confidence_present"
    | "safety_language";
  severity: "block" | "warn";
  message: string;
  path?: string;
}

/** Immutable provenance recorded for every AI interaction (spec Step 25). */
export interface GatewayProvenance {
  requestId: string;
  feature: GatewayFeature;
  provider: ModelProviderName | null;
  model: string | null;
  modelVersion: string | null;
  promptVersion: string;
  evidenceVersion: string;
  sciVersion: string;
  configVersion: string;
  taskType: AITaskType;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  resultStatus: GatewayResultStatus;
  confidence: ConfidenceClass | null;
  safetyStatus: GatewaySafetyStatus;
  fallbackUsed: boolean;
  attemptCount: number;
  citations: string[];
  sciFindings: SciFinding[];
  /**
   * Why a degraded result degraded.
   *
   * Server-side only — it is persisted in the audit trail, not sent to a member.
   * The client gets `diagnostics`, which is the same information filtered down to
   * what is safe and useful for a member.
   */
  degradation: GatewayDegradation | null;
}

/**
 * Why the AI portion of a response could not run as intended.
 *
 * Kept small and fixed so a UI can branch on it without parsing prose, and so a
 * misconfiguration is never mistaken for an outage: `engine_rejected` means fix
 * the config, `engine_unreachable` means check the network, and both are
 * permanent until something changes.
 */
export type GatewayDegradationReason =
  | "generation_failed"
  | "schema_invalid"
  | "guardrail_blocked"
  | "integrity_check_failed"
  | "no_evidence";

/** One engine's contribution to a degradation. */
export interface GatewayEngineFailure {
  provider: ModelProviderName;
  kind: ModelProviderErrorKind;
  httpStatus: number | null;
  /**
   * Redacted provider explanation, e.g. "code=model_not_supported".
   *
   * Safe for the server log and the admin health endpoint. Never included in a
   * member-facing payload, because it can name model ids and hostnames.
   */
  detail: string | null;
  retryable: boolean;
}

/** Server-side record of a degraded result, persisted for audit. */
export interface GatewayDegradation {
  reason: GatewayDegradationReason;
  engines: GatewayEngineFailure[];
}

/**
 * What the client is told when a response was degraded.
 *
 * `message` is member-safe prose. `engines` carries the classification only —
 * no URL, no model id, no provider text — because the AI Lab is a member
 * reachable surface and the detail is not the member's business.
 */
export interface GatewayDegradationDiagnostics {
  degraded: true;
  reason: GatewayDegradationReason;
  message: string;
  engines: Array<{
    provider: ModelProviderName;
    kind: ModelProviderErrorKind;
    httpStatus: number | null;
    retryable: boolean;
  }>;
  /** True when a retry could plausibly succeed without a config change. */
  retryable: boolean;
}

export interface GatewaySuccess {
  ok: true;
  output: GatewayOutput;
  provenance: GatewayProvenance;
  /**
   * Present only when the response is degraded. A member-facing explanation of
   * what could not run and why; `undefined` on a clean, approved result so a
   * normal response carries no AI-failure vocabulary at all.
   */
  diagnostics?: GatewayDegradationDiagnostics;
}

export interface GatewayFailure {
  ok: false;
  /** Client-safe message. Never contains provider errors, keys or hostnames. */
  message: string;
  statusCode: number;
  provenance: GatewayProvenance;
}

export type GatewayResult = GatewaySuccess | GatewayFailure;
