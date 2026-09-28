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
 * Shared OpenAI-compatible chat-completions transport.
 *
 * Llama 3, Med42 and most self-hosted inference servers (vLLM, TGI, llama.cpp,
 * Together, Fireworks, Ollama) speak this dialect. Keeping the transport in one
 * place means a new engine is a config entry, not a new networking layer.
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

      const response = await fetch(
        `${this.config.baseUrl.replace(/\/+$/, "")}${this.config.chatPath ?? "/v1/chat/completions"}`,
        { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal }
      );

      if (response.status === 429) {
        throw new ModelProviderError("rate_limited", this.name, `Provider "${this.name}" is rate limited`);
      }
      if (!response.ok) {
        throw new ModelProviderError(
          "unavailable",
          this.name,
          `Provider "${this.name}" returned status ${response.status}`
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

      const response = await fetch(
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
          signal: AbortSignal.timeout(5000),
        }
      );

      const latencyMs = Date.now() - startedAt;
      return {
        provider: this.name,
        status: response.ok ? "healthy" : "degraded",
        latencyMs,
        detail: response.ok ? null : `Probe returned status ${response.status}.`,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "unavailable",
        latencyMs: null,
        detail: error instanceof ModelProviderError ? error.message : "Provider probe failed.",
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

  /** Maps any transport failure onto a classified, credential-free error. */
  private classify(error: unknown, aborted: boolean): ModelProviderError {
    if (error instanceof ModelProviderError) return error;

    if (aborted) {
      return new ModelProviderError("timeout", this.name, `Provider "${this.name}" timed out`, {
        cause: error,
      });
    }

    return new ModelProviderError(
      "unavailable",
      this.name,
      `Provider "${this.name}" could not be reached`,
      { cause: error }
    );
  }
}
