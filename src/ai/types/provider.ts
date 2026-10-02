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

export type ModelProviderName = "llama" | "med42" | "gemini";

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
  /**
   * Opaque identity of the endpoint and weights this engine will actually call,
   * for deciding whether a fallback route is worth attempting.
   *
   * Two registered engines can be configured against the same host with the same
   * model. Attempting the identical endpoint twice cannot succeed where the first
   * attempt did not — it only doubles how long a member waits for the
   * deterministic fallback — so the router compares this instead of the provider
   * name.
   *
   * Must be a one-way digest, never the URL itself: this value is compared and
   * potentially logged, and a hostname is not something to spread further.
   * Optional, so an engine that cannot express it is simply never deduped.
   */
  getEndpointIdentity?(): string | null;
}

export type ModelProviderErrorKind =
  | "not_configured"
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "invalid_response"
  /**
   * The engine answered and refused the request: 400/404 for a model id it does
   * not serve, 401/403 for a rejected key, 422 for a request it will never
   * accept.
   *
   * This kind exists because collapsing it into `unavailable` made a permanent
   * configuration mistake look like a temporary outage. Nothing about a bad
   * model id is fixed by retrying, and an operator reading "unavailable" has no
   * way to know that.
   */
  | "rejected"
  | "unknown";

/**
 * Removes credential-shaped substrings from provider text.
 *
 * Provider error bodies are echoed into the server log and the admin health
 * endpoint, and a 401 from one hosted API can include the key it rejected. This
 * runs on everything before it is stored anywhere, and strips the common token
 * shapes so a diagnostic can never become a leak.
 */
export function redactProviderText(value: string, maxLength = 300): string {
  const redacted = value
    // Authorization headers and bearer tokens, however they are labelled.
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|authorization|token|secret|password)["'\s]*[:=]\s*["']?)[^\s"',}]+/gi, "$1[redacted]")
    // Hugging Face user/org access tokens.
    .replace(/\bhf_[A-Za-z0-9]{8,}/g, "hf_[redacted]")
    // Google API keys, which Gemini is authenticated with.
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "AIza[redacted]")
    // Anything that looks like a JWT.
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-jwt]")
    .replace(/\s+/g, " ")
    .trim();

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

/**
 * Provider failures are wrapped so the Gateway can classify them and decide on
 * fallback without ever surfacing raw provider messages or keys to the client.
 */
export class ModelProviderError extends Error {
  readonly kind: ModelProviderErrorKind;
  readonly provider: ModelProviderName;
  readonly retryable: boolean;
  readonly cause?: unknown;
  /** HTTP status, when the engine answered at all. */
  readonly httpStatus: number | null;
  /**
   * Redacted provider explanation, for the server log and the admin health
   * endpoint. Never attached to a member-facing response — that gets
   * `toClientSafeProviderMessage` instead.
   */
  readonly detail: string | null;

  constructor(
    kind: ModelProviderErrorKind,
    provider: ModelProviderName,
    message: string,
    options: { retryable?: boolean; cause?: unknown; httpStatus?: number | null; detail?: string | null } = {}
  ) {
    super(message);
    this.name = "ModelProviderError";
    this.kind = kind;
    this.provider = provider;
    // A refusal is permanent: the same request will be refused identically on a
    // retry, so a `4xx` must never be treated as a blip worth re-attempting.
    this.retryable = options.retryable ?? (kind === "not_configured" || kind === "rejected" ? false : true);
    this.cause = options.cause;
    this.httpStatus = options.httpStatus ?? null;
    this.detail = options.detail ? redactProviderText(options.detail) : null;
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
    case "rejected":
      // Deliberately does not say which engine or what it objected to: a
      // misconfigured model id is an operator problem, and naming it to a member
      // would invite support tickets about our infrastructure.
      return "The intelligence service could not accept the request. Your data is saved — please try again.";
    case "unavailable":
    case "invalid_response":
    case "unknown":
    default:
      return "We could not complete this request right now. Your data is saved — please try again.";
  }
}
