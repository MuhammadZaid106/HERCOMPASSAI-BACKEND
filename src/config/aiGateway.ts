import { env } from "./env.js";
import type {
  AITaskType,
  EvidenceStatus,
  GatewayActorRole,
  GatewayFeature,
  ModelProviderName,
} from "../ai/types/index.js";

/**
 * HerCompass AI Gateway configuration.
 *
 * Directive: "The exact proprietary routing strategy should remain configurable
 * rather than embedded throughout application code." Nothing here encodes
 * provider-specific business logic â€” it is a declarative policy table that the
 * Model Router reads.
 */

export interface ModelRouteRule {
  feature: GatewayFeature;
  taskType: AITaskType;
  /** Preferred engine for this route. */
  primary: ModelProviderName;
  /** Ordered fallback engines, tried when the primary fails. */
  fallbackChain: ModelProviderName[];
  temperature: number;
  maxOutputTokens: number;
  /** Minimum number of citations required on claim-bearing output. */
  minCitations: number;
}

export interface FeaturePolicy {
  feature: GatewayFeature;
  /** Roles allowed to invoke the feature. Authorization is enforced server-side. */
  allowedRoles: GatewayActorRole[];
  /** Prompt bundle key in the prompt registry. */
  promptKey: string;
  /** Default prompt version when the caller does not pin one. */
  defaultPromptVersion: string;
  /** Zod schema the generated payload must satisfy. */
  outputSchemaKey: "personal_snapshot" | "partner_digest";
  /** Deterministic signal fields expected for the completeness calculation. */
  expectedSignals: string[];
  /** Falls back to deterministic content when validation fails. */
  allowDeterministicFallback: boolean;
}

const ROUTING: ModelRouteRule[] = [
  {
    feature: "personal_snapshot",
    taskType: "structured_generation",
    primary: "med42",
    fallbackChain: ["llama", "openai_compatible"],
    temperature: 0.3,
    maxOutputTokens: 1600,
    minCitations: 1,
  },
  {
    feature: "partner_digest",
    taskType: "structured_generation",
    primary: "llama",
    fallbackChain: ["med42", "openai_compatible"],
    temperature: 0.4,
    maxOutputTokens: 1200,
    minCitations: 1,
  },
  {
    feature: "ai_insight",
    taskType: "interpretation",
    primary: "llama",
    fallbackChain: ["med42", "openai_compatible"],
    temperature: 0.3,
    maxOutputTokens: 900,
    minCitations: 1,
  },
  {
    feature: "ai_insight",
    taskType: "classification",
    primary: "llama",
    fallbackChain: ["med42", "openai_compatible"],
    temperature: 0.1,
    maxOutputTokens: 400,
    minCitations: 0,
  },
  {
    feature: "ai_insight",
    taskType: "summarization",
    primary: "llama",
    fallbackChain: ["med42", "openai_compatible"],
    temperature: 0.2,
    maxOutputTokens: 700,
    minCitations: 0,
  },
];

const FEATURES: FeaturePolicy[] = [
  {
    feature: "personal_snapshot",
    allowedRoles: ["member", "admin"],
    promptKey: "snapshot",
    defaultPromptVersion: "v1",
    outputSchemaKey: "personal_snapshot",
    expectedSignals: [
      "symptomBurdenScore",
      "sleepDisturbanceScore",
      "vitalityIndex",
      "emotionalBalanceScore",
      "dominantFocusArea",
    ],
    allowDeterministicFallback: true,
  },
  {
    feature: "partner_digest",
    allowedRoles: ["partner", "admin"],
    promptKey: "partner_digest",
    defaultPromptVersion: "v1",
    outputSchemaKey: "partner_digest",
    expectedSignals: ["supportFocusArea", "sharedScopeCount"],
    allowDeterministicFallback: true,
  },
  {
    feature: "ai_insight",
    allowedRoles: ["member", "partner", "admin"],
    promptKey: "insight",
    defaultPromptVersion: "v1",
    outputSchemaKey: "personal_snapshot",
    expectedSignals: ["dominantFocusArea"],
    allowDeterministicFallback: true,
  },
];

export const AI_GATEWAY_CONFIG = {
  enabled: env.AI_GATEWAY_ENABLED,

  /** Version stamps recorded on every AI event for auditability. */
  versions: {
    sci: env.AI_GATEWAY_SCI_VERSION || env.AI_GATEWAY_CI_VERSION || "1.0",
    evidence: env.AI_GATEWAY_EVIDENCE_VERSION,
    config: env.AI_GATEWAY_CONFIG_VERSION,
  },

  limits: {
    timeoutMs: env.AI_GATEWAY_TIMEOUT_MS,
    maxFallbackAttempts: env.AI_GATEWAY_MAX_FALLBACK_ATTEMPTS,
    /** Hard cap on characters of assembled model context. */
    maxContextChars: 12000,
    maxEvidenceItems: 6,
    maxRecommendations: 5,
    minRecommendations: 1,
    maxNextSteps: 3,
    maxReportedAreas: 12,
    maxOutputChars: 20000,
  },

  evidence: {
    minRelevance: env.AI_GATEWAY_EVIDENCE_MIN_RELEVANCE,
    /** Only records in one of these states may enter model context. */
    allowedStatuses: ["approved"] as readonly EvidenceStatus[],
  },

  /**
   * Confidence is calculated deterministically from four weighted components.
   * The LLM never invents a numeric confidence value (spec Section 13).
   */
  confidence: {
    weights: {
      evidenceStrength: 0.4,
      dataCompleteness: 0.2,
      patternConsistency: 0.2,
      modelEvaluation: 0.2,
    },
    thresholds: {
      high: 0.75,
      moderate: 0.5,
    },
  },

  routing: ROUTING,
  features: FEATURES,

  /** Defence in depth: no engine may emit numbers we cannot trace to context. */
  numericGrounding: {
    enabled: true,
    /** Percentages/tokens are allowed if they appear in the deterministic context. */
    requireTraceableToContext: true,
  },

  /** Deterministic clinical safety notice appended to every approved output. */
  safetyNotice:
    "HerCompassAI provides non-diagnostic, evidence-informed wellness education. It is not a medical diagnosis, treatment plan, or substitute for professional care. If symptoms are worsening, persistent, or concerning to you, speak with a qualified healthcare professional.",

providers: {
    llama: {
      url: env.LLAMA_PROVIDER_URL,
      apiKey: env.LLAMA_PROVIDER_KEY,
      model: env.LLAMA_MODEL,
      modelVersion: env.LLAMA_MODEL_VERSION,
    },
    med42: {
      url: env.MED42_PROVIDER_URL,
      apiKey: env.MED42_PROVIDER_KEY,
      model: env.MED42_MODEL,
      modelVersion: env.MED42_MODEL_VERSION,
    },
    openai_compatible: {
      url: env.OPENAI_COMPATIBLE_PROVIDER_URL,
      apiKey: env.OPENAI_COMPATIBLE_PROVIDER_KEY,
      model: env.OPENAI_COMPATIBLE_MODEL,
      modelVersion: env.OPENAI_COMPATIBLE_MODEL_VERSION,
    },
  },
} as const;

export function getFeaturePolicy(feature: GatewayFeature): FeaturePolicy | undefined {
  return AI_GATEWAY_CONFIG.features.find((policy) => policy.feature === feature);
}

export function getRouteRule(
  feature: GatewayFeature,
  taskType: AITaskType
): ModelRouteRule | undefined {
  return AI_GATEWAY_CONFIG.routing.find(
    (rule) => rule.feature === feature && rule.taskType === taskType
  );
}
