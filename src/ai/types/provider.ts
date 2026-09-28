/**
 * HerCompass AI Gateway — Model Provider Abstraction
 *
 * Directive (Milestone 1–2 spec, Steps 16–18):
 *   Feature -> Backend -> AI Gateway -> Model Router -> Model Provider
 *
 * Feature modules never import a provider adapter directly. They depend on the
 * Gateway contract below, so a new engine can be added without rewriting the product.
 *
 * Llama 3 and Med42 are replaceable engines. They are NOT the HerCompass
 * Intelligence Stack™. The Gateway is the architectural control point.
 */

export type ModelProviderName = "llama" | "med42" | "openai_compatible";

/** Task taxonomy used by the router to select an engine. */
export type AITaskType =
  | "structured_generation"
  | "interpretation"
  | "classification"
  | "summarization";

/** Capability flags the router matches against. */
export type ModelCapability =
  | "json_mode"
  | "system_role"
  | "clinical_reasoning"
  | "long_context"
  | "streaming";

export type ModelDomain = "general" | "clinical" | "behavioral";

export type ModelFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_call"
  | "error";

export type ModelResponseFormat = "json_object" | "text";

export type ProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "not_configured";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Standardized request. Provider adapters translate this into their own wire
 * syntax, so no feature ever knows Llama- or Med42-specific request shapes.
 */
export interface ModelGenerationRequest {
  requestId: string;
  taskType: AITaskType;
  messages: ModelMessage[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  responseFormat: ModelResponseFormat;
  metadata: Record<string, string>;
}

export interface ModelUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

/** Standardized response returned by every adapter. */
export interface ModelGenerationResponse {
  provider: ModelProviderName;
  model: string;
  modelVersion: string;
  content: string;
  finishReason: ModelFinishReason;
  usage: ModelUsage;
  latencyMs: number;
}

export interface ModelCapabilities {
  provider: ModelProviderName;
  domain: ModelDomain;
  taskTypes: AITaskType[];
  supports: ModelCapability[];
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface ModelMetadata {
  provider: ModelProviderName;
  model: string;
  modelVersion: string;
  deployment: string;
  /** Coarse deployment region label. Never a credential or hostname secret. */
  region: string;
}

export interface ProviderHealth {
  provider: ModelProviderName;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

/**
 * The one contract every engine implements (spec Step 16):
 *   generate(), healthCheck(), getCapabilities(), getModelMetadata()
 */
export interface ModelProvider {
  readonly name: ModelProviderName;
  generate(request: ModelGenerationRequest): Promise<ModelGenerationResponse>;
  healthCheck(): Promise<ProviderHealth>;
  getCapabilities(): ModelCapabilities;
  getModelMetadata(): ModelMetadata;
}

export type ModelProviderErrorKind =
  | "not_configured"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "invalid_response"
  | "unknown";

/**
 * Provider failures are wrapped so the Gateway can classify them and decide on
 * fallback without ever surfacing raw provider messages or keys to the client.
 */
export class ModelProviderError extends Error {
  readonly kind: ModelProviderErrorKind;
  readonly provider: ModelProviderName;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    kind: ModelProviderErrorKind,
    provider: ModelProviderName,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ModelProviderError";
    this.kind = kind;
    this.provider = provider;
    this.retryable = options.retryable ?? kind !== "not_configured";
    this.cause = options.cause;
  }
}

/** Maps a provider error kind to the safe message the client is allowed to see. */
export function toClientSafeProviderMessage(kind: ModelProviderErrorKind): string {
  switch (kind) {
    case "not_configured":
      return "The intelligence service is not configured yet. Please try again shortly.";
    case "timeout":
      return "The intelligence service took too long to respond. Please try again.";
    case "rate_limited":
      return "The intelligence service is busy right now. Please try again shortly.";
    case "unavailable":
    case "invalid_response":
    case "unknown":
    default:
      return "We could not complete this request right now. Your data is saved — please try again.";
  }
}
