/**
 * HerCompass AI Gateway — Canonical contract types
 *
 * The Gateway owns: authentication, authorization, request validation, context
 * assembly, evidence retrieval, model selection, prompt selection, guardrails,
 * SCI, citation verification, confidence, safety checks, logging, error handling
 * and fallback behaviour. Nothing outside this boundary talks to a model.
 */

import type { AITaskType, ModelProviderName } from "./provider.js";

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
}

export interface GatewaySuccess {
  ok: true;
  output: GatewayOutput;
  provenance: GatewayProvenance;
}

export interface GatewayFailure {
  ok: false;
  /** Client-safe message. Never contains provider errors, keys or hostnames. */
  message: string;
  statusCode: number;
  provenance: GatewayProvenance;
}

export type GatewayResult = GatewaySuccess | GatewayFailure;
