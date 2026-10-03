import { createHash } from "node:crypto";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import {
  describeTransportFailure,
  formatStatusSuffix,
  isPermanentRejection,
  readErrorDetail,
} from "./providerTransport.js";
import {
  ModelProviderError,
  type AITaskType,
  type ModelCapabilities,
  type ModelFinishReason,
  type ModelGenerationRequest,
  type ModelGenerationResponse,
  type ModelMessage,
  type ModelMetadata,
  type ModelProvider,
  type ModelProviderName,
  type ModelUsage,
  type ProviderHealth,
} from "../types/index.js";

/**
 * OpenAI-compatible chat-completions transport.
 *
 * Llama 3, Med42 and most self-hosted inference servers (vLLM, TGI, llama.cpp,
 * Together, Fireworks, Ollama) speak this dialect. Keeping the transport in one
 * place means a new engine is a config entry, not a new networking layer.
 *
 * Google Gemini is the exception: it is served by `GeminiProvider`, which speaks
 * the native `generateContent` dialect rather than emulating this one. Failure
 * classification is shared between them in `providerTransport.ts`.
 *
 * Security: credentials are attached here and nowhere else. They are never
 * logged, never placed in an error message, and never returned to a caller.
 */

export interface HttpProviderConfig {
  name: ModelProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  modelVersion: string;
  domain: ModelCapabilities["domain"];
  taskTypes: AITaskType[];
  maxContextTokens: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  deployment: string;
  region: string;
  /** Route appended to the base URL. Overridable for non-standard deployments. */
  chatPath?: string;
  supportsJsonMode: boolean;
  /**
   * Transport seam. Defaults to the global `fetch`.
   *
   * The failure classification is the part of this class that matters most and
   * the part that was previously wrong, and it can only be tested against real
   * status codes and real error bodies. Without an injection point, asserting
   * that a 400 is recognised as a rejection requires either a live provider or no
   * test at all — and the bug being fixed here is exactly one that no live test
   * would have caught, because the live provider returned 400 and the code called
   * it "unavailable".
   */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

const FINISH_REASONS: ReadonlySet<string> = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
]);

function normalizeFinishReason(raw: string | null | undefined): ModelFinishReason {
  if (!raw) return "stop";
  if (raw === "tool_calls") return "tool_call";
  if (FINISH_REASONS.has(raw)) return raw as ModelFinishReason;
  return "stop";
}

function normalizeUsage(usage: ChatCompletionResponse["usage"]): ModelUsage {
  const promptTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
  const completionTokens =
    typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
  const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Extracts the provider's own explanation from an error body.
 *
 * Every OpenAI-compatible API returns a machine-readable `error` object, and its
 * `message` is the difference between "this model id is wrong" and "this token
 * is invalid" — two problems with two completely different fixes. Discarding the
 * body is what reduced both to the word "unavailable".
 *
 * See `providerTransport.ts` for the shared implementation and the redaction
 * rules it applies.
 */

export class HttpChatProvider implements ModelProvider {
  readonly name: ModelProviderName;

  private readonly config: HttpProviderConfig;

  constructor(config: HttpProviderConfig) {
    this.config = config;
    this.name = config.name;
  }

  get isConfigured(): boolean {
    return this.config.baseUrl.trim() !== "" && this.config.model.trim() !== "";
  }

  /** The configured transport, or the platform default. */
  private transport(): typeof fetch {
    return this.config.fetchImpl ?? fetch;
  }

  async generate(request: ModelGenerationRequest): Promise<ModelGenerationResponse> {
    if (!this.isConfigured) {
      throw new ModelProviderError(
        "not_configured",
        this.name,
        `Provider "${this.name}" has no endpoint or model configured`
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const body = {
        model: this.config.model,
        messages: request.messages.map((message: ModelMessage) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        ...(this.config.supportsJsonMode && request.responseFormat === "json_object"
          ? { response_format: { type: "json_object" } }
          : {}),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.config.apiKey.trim() !== "") {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await this.transport()(
        `${this.config.baseUrl.replace(/\/+$/, "")}${this.config.chatPath ?? "/v1/chat/completions"}`,
        { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal }
      );

      if (response.status === 429) {
        throw new ModelProviderError("rate_limited", this.name, `Provider "${this.name}" is rate limited`, {
          httpStatus: 429,
          detail: await readErrorDetail(response),
        });
      }
      if (!response.ok) {
        // A 4xx is the engine telling us it will never serve this request — a
        // model id it does not host, or a key it will not accept. Reporting that
        // as "unavailable" is what made a permanent misconfiguration look like a
        // transient outage, so the kind now distinguishes "try again" from
        // "fix the configuration".
        const kind = isPermanentRejection(response.status) ? "rejected" : "unavailable";
        const detail = await readErrorDetail(response);
        throw new ModelProviderError(
          kind,
          this.name,
          `Provider "${this.name}" returned status ${response.status}${formatStatusSuffix(detail)}`,
          { httpStatus: response.status, detail }
        );
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;

      if (typeof content !== "string" || content.trim() === "") {
        throw new ModelProviderError(
          "invalid_response",
          this.name,
          `Provider "${this.name}" returned an empty completion`
        );
      }

      return {
        provider: this.name,
        model: this.config.model,
        modelVersion: this.config.modelVersion || this.config.model,
        content,
        finishReason: normalizeFinishReason(payload.choices?.[0]?.finish_reason),
        usage: normalizeUsage(payload.usage),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw this.classify(error, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) {
      return {
        provider: this.name,
        status: "not_configured",
        latencyMs: null,
        detail: "No endpoint or model configured for this provider.",
        checkedAt: new Date().toISOString(),
      };
    }

    const startedAt = Date.now();
    try {
      // A 1-token probe keeps the check cheap; any HTTP answer proves reachability.
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.config.apiKey.trim() !== "") {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await this.transport()(
        `${this.config.baseUrl.replace(/\/+$/, "")}${this.config.chatPath ?? "/v1/chat/completions"}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: this.config.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(AI_GATEWAY_CONFIG.limits.healthTimeoutMs),
        }
      );

      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        return {
          provider: this.name,
          status: "healthy",
          latencyMs,
          detail: null,
          checkedAt: new Date().toISOString(),
        };
      }

      // A refusal and an outage are different problems with different fixes, so
      // the probe distinguishes them. This is the endpoint an operator checks
      // when a model stops responding, so "status 400" alone is not enough - the
      // provider's own explanation is what identifies the bad model id.
      const detail = await readErrorDetail(response);
      return {
        provider: this.name,
        status: isPermanentRejection(response.status) ? "degraded" : "unavailable",
        latencyMs,
        detail: `Probe returned status ${response.status} for model "${this.config.model}"${formatStatusSuffix(detail)}.`,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "unavailable",
        latencyMs: null,
        detail: error instanceof ModelProviderError ? error.message : describeTransportFailure(error),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  getCapabilities(): ModelCapabilities {
    return {
      provider: this.name,
      domain: this.config.domain,
      taskTypes: this.config.taskTypes,
      supports: this.config.supportsJsonMode
        ? ["json_mode", "system_role", "streaming"]
        : ["system_role", "streaming"],
      maxContextTokens: this.config.maxContextTokens,
      maxOutputTokens: this.config.maxOutputTokens,
    };
  }

  getModelMetadata(): ModelMetadata {
    return {
      provider: this.name,
      model: this.config.model || "unconfigured",
      modelVersion: this.config.modelVersion || "unversioned",
      deployment: this.config.deployment,
      region: this.config.region,
    };
  }

  getDefaultTemperature(): number {
    return this.config.defaultTemperature;
  }

  /**
   * One-way digest of the endpoint plus the model, so the router can tell two
   * registrations apart only when they really are the same engine.
   *
   * The deployment label cannot do this: it is a fixed name per engine ("med42",
   * "llama-3"), so two engines pointed at one host and model keep different labels
   * and the dedupe never fires — which is precisely the case it exists for.
   *
   * Hashed because the router may log this and because a hostname is not
   * something to propagate further than it already is.
   */
  getEndpointIdentity(): string | null {
    if (!this.isConfigured) return null;
    const base = `${this.config.baseUrl.replace(/\/+$/, "")}${this.config.chatPath ?? "/v1/chat/completions"}`;
    return createHash("sha256").update(`${base}::${this.config.model}`).digest("hex").slice(0, 16);
  }

  /** Maps any transport failure onto a classified, credential-free error. */
  private classify(error: unknown, aborted: boolean): ModelProviderError {
    if (error instanceof ModelProviderError) return error;

    if (aborted) {
      return new ModelProviderError("timeout", this.name, `Provider "${this.name}" timed out`, {
        cause: error,
        detail: `No response within the configured timeout.`,
      });
    }

    // A bare `fetch` rejection carries a system code in its cause — ENOTFOUND,
    // ECONNREFUSED, CERT_HAS_EXPIRED. That code is the entire difference between
    // "wrong hostname" and "nothing is listening", and both read as
    // "could not be reached" without it, so it is surfaced explicitly.
    return new ModelProviderError(
      "unavailable",
      this.name,
      `Provider "${this.name}" could not be reached${describeTransportFailure(error) ? ` (${describeTransportFailure(error)})` : ""}`,
      { cause: error, detail: describeTransportFailure(error) }
    );
  }
}