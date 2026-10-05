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
 * Google Gemini adapter, speaking the native `generateContent` dialect.
 *
 * Gemini also publishes an OpenAI-compatible surface, but the native API is used
 * here on purpose: it is Google's own contract, it does not change shape under
 * us, and it exposes fields the emulation drops — `systemInstruction` as a
 * distinct field rather than a `system` message some backends silently discard,
 * and `usageMetadata` in Google's own token accounting. A system prompt that a
 * backend quietly drops is a safety-prompt failure that looks like a compliance
 * failure, so the field the API actually honours is the one sent.
 *
 * This is the proof that the Gateway abstraction holds: a second, structurally
 * different wire protocol added as one adapter plus one config block, with no
 * feature module and no router logic changed.
 *
 * Security: the key is sent as `x-goog-api-key`, attached here and nowhere else.
 * It is never logged, never placed in an error message, and never returned.
 */

export interface GeminiProviderConfig {
  name: ModelProviderName;
  /** API root. The model path and `:generateContent` are appended to it. */
  baseUrl: string;
  apiKey: string;
  /** Model id without the `models/` prefix, e.g. `gemini-2.5-flash`. */
  model: string;
  modelVersion: string;
  domain: ModelCapabilities["domain"];
  taskTypes: AITaskType[];
  maxContextTokens: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  deployment: string;
  region: string;
  supportsJsonMode: boolean;
  /** Test seam. Defaults to the global `fetch`. See `HttpProviderConfig`. */
  fetchImpl?: typeof fetch;
}

/** One `parts[]` entry. Only text is used; the Gateway has no multimodal need. */
interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string | null;
  /** Populated instead of `candidates` when the prompt is blocked up front. */
  finishMessage?: string | null;
  index?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[] | null;
  promptFeedback?: { blockReason?: string | null } | null;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
}

/**
 * Gemini's `finishReason` enum onto the Gateway's.
 *
 * The safety family is the part that matters. `SAFETY`, `RECITATION`,
 * `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII` and `LANGUAGE` all mean the model
 * declined to answer, and collapsing them into `"stop"` would hand the Gateway a
 * clean finish on an empty answer and report a complete Snapshot with nothing in
 * it. Anything unrecognised stays `"stop"` because guessing a refusal would make
 * a working engine look blocked.
 */
const FINISH_REASONS: Readonly<Record<string, ModelFinishReason>> = {
  STOP: "stop",
  MAX_TOKENS: "length",
  SAFETY: "content_filter",
  RECITATION: "content_filter",
  BLOCKLIST: "content_filter",
  PROHIBITED_CONTENT: "content_filter",
  SPII: "content_filter",
  LANGUAGE: "content_filter",
  MALFORMED_FUNCTION_CALL: "error",
};

const SAFETY_BLOCK_REASONS: ReadonlySet<string> = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "LANGUAGE",
]);

function normalizeFinishReason(raw: string | null | undefined): ModelFinishReason {
  if (!raw) return "stop";
  return FINISH_REASONS[raw] ?? "stop";
}

function normalizeUsage(usage: GeminiResponse["usageMetadata"]): ModelUsage {
  return {
    promptTokens: typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
    completionTokens:
      typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null,
    totalTokens: typeof usage?.totalTokenCount === "number" ? usage.totalTokenCount : null,
  };
}

/**
 * Maps Gateway messages onto Gemini's `contents` + `systemInstruction`.
 *
 * `system` is not a role in `contents` — it is a separate top-level field — and
 * `assistant` is called `model`. Conflating them produces a 400 from the API, or
 * with a lenient proxy, a quietly ignored system prompt.
 */

/**
 * Returns true for models in the 2.5 family that accept `thinkingConfig`.
 * The 3.8 family and earlier models do not expose this field and return an
 * empty candidates array (or the "model output must contain…" error) when it
 * is present.
 */
function supportsThinkingConfig(model: string): boolean {
  return /gemini-2\.5/i.test(model);
}

function buildRequestBody(
  messages: ModelMessage[],
  temperature: number,
  maxOutputTokens: number,
  jsonMode: boolean,
  model: string
): Record<string, unknown> {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return {
    ...(systemText.trim() === ""
      ? {}
      : { systemInstruction: { role: "system", parts: [{ text: systemText }] } }),
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
      // Gemini expresses JSON mode as a MIME type on the response, not as a
      // `response_format` object. The Gateway asks for the same guarantee under
      // a different name.
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      /**
       * Thinking is switched off for 2.5-family models, and `maxOutputTokens` is
       * the reason. Reasoning tokens are drawn from the *output* budget, so a
       * thinking model spends the allowance the answer needed before writing any.
       * Measured on `gemini-2.5-flash` against the real `ai_insight` prompt at
       * the route's 900-token budget: 863 tokens of thinking, 33 of answer,
       * `MAX_TOKENS`, cut off mid-string. `jsonPayload.ts` cannot recover that.
       *
       * For 3.8-flash and other non-thinking models the field MUST be omitted.
       * Google's API returns an empty candidates array (or "model output must
       * contain either output text or tool calls") when `thinkingConfig` is sent
       * to a model that does not support it.
       */
      ...(supportsThinkingConfig(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

/**
 * Concatenates the text parts of a candidate, which may arrive split.
 *
 * Reasoning models report their thinking through `usageMetadata.thoughtsTokenCount`,
 * not as `parts[]` entries — verified against `gemini-3.8-flash`, which returns a
 * single unflagged part. There is no chain-of-thought in the text to strip.
 */
function readCandidateText(candidate: GeminiCandidate | undefined): string | null {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
  return text.trim() === "" ? null : text;
}

export class GeminiProvider implements ModelProvider {
  readonly name: ModelProviderName;

  private readonly config: GeminiProviderConfig;

  constructor(config: GeminiProviderConfig) {
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

  /** Key in the header Google expects, and never in the query string. */
  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey.trim() !== "") {
      headers["x-goog-api-key"] = this.config.apiKey;
    }
    return headers;
  }

  private endpoint(): string {
    const root = this.config.baseUrl.replace(/\/+$/, "");
    const model = this.config.model.replace(/^models\//, "");
    return `${root}/models/${model}:generateContent`;
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
      const body = buildRequestBody(
        request.messages,
        request.temperature,
        request.maxOutputTokens,
        this.config.supportsJsonMode && request.responseFormat === "json_object",
        this.config.model
      );

      const response = await this.transport()(this.endpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new ModelProviderError("rate_limited", this.name, `Provider "${this.name}" is rate limited`, {
          httpStatus: 429,
          detail: await readErrorDetail(response),
        });
      }
      if (!response.ok) {
        // A 4xx is permanent: a model id this key cannot serve, or a key this
        // endpoint will not accept. Calling that "unavailable" is what made a
        // configuration mistake look like an outage.
        const kind = isPermanentRejection(response.status) ? "rejected" : "unavailable";
        const detail = await readErrorDetail(response);
        throw new ModelProviderError(
          kind,
          this.name,
          `Provider "${this.name}" returned status ${response.status}${formatStatusSuffix(detail)}`,
          { httpStatus: response.status, detail }
        );
      }

      const payload = (await response.json()) as GeminiResponse;
      const candidate = payload.candidates?.[0];
      const content = readCandidateText(candidate);

      if (content === null) {
        throw this.emptyCompletionError(payload, candidate);
      }

      return {
        provider: this.name,
        model: this.config.model,
        modelVersion: this.config.modelVersion || this.config.model,
        content,
        finishReason: normalizeFinishReason(candidate?.finishReason),
        usage: normalizeUsage(payload.usageMetadata),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw this.classify(error, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Explains an answer that carried no text.
   *
   * Gemini reports a refusal in two different shapes: `promptFeedback.blockReason`
   * when the prompt is blocked before generation starts, and `finishReason` on
   * the candidate when it is blocked partway through. Both arrive as an empty or
   * absent `candidates` array, so without this the Gateway would report a
   * provider that "returned an empty completion" — which sends an operator
   * looking for a transport fault when the model simply declined.
   *
   * Non-retryable either way: the same prompt is refused identically on a retry,
   * and re-spending a member's wait to learn that again is the wrong trade.
   */
  private emptyCompletionError(
    payload: GeminiResponse,
    candidate: GeminiCandidate | undefined
  ): ModelProviderError {
    const blockReason = payload.promptFeedback?.blockReason;
    const finishReason = candidate?.finishReason;

    if (typeof blockReason === "string" && SAFETY_BLOCK_REASONS.has(blockReason)) {
      return new ModelProviderError(
        "invalid_response",
        this.name,
        `Provider "${this.name}" blocked the prompt (${blockReason})`,
        { retryable: false, detail: `Blocked before generation: ${blockReason}.` }
      );
    }

    if (typeof finishReason === "string" && SAFETY_BLOCK_REASONS.has(finishReason)) {
      return new ModelProviderError(
        "invalid_response",
        this.name,
        `Provider "${this.name}" returned no content (${finishReason})`,
        { retryable: false, detail: `Blocked during generation: ${finishReason}.` }
      );
    }

    return new ModelProviderError(
      "invalid_response",
      this.name,
      `Provider "${this.name}" returned an empty completion`
    );
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
      const response = await this.transport()(this.endpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        }),
        signal: AbortSignal.timeout(AI_GATEWAY_CONFIG.limits.healthTimeoutMs),
      });

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
        ? ["json_mode", "system_role", "long_context", "streaming"]
        : ["system_role", "long_context", "streaming"],
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
   * registrations apart only when they really are the same engine. Matches
   * `HttpChatProvider` so the router's dedupe behaves identically across dialects.
   */
  getEndpointIdentity(): string | null {
    if (!this.isConfigured) return null;
    return createHash("sha256")
      .update(`${this.endpoint()}::${this.config.model}`)
      .digest("hex")
      .slice(0, 16);
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

const GEMINI_TASK_TYPES: AITaskType[] = [
  "structured_generation",
  "interpretation",
  "classification",
  "summarization",
];

export const geminiProvider: GeminiProvider = new GeminiProvider({
  name: "gemini" as ModelProviderName,
  baseUrl: AI_GATEWAY_CONFIG.providers.gemini.url,
  apiKey: AI_GATEWAY_CONFIG.providers.gemini.apiKey,
  model: AI_GATEWAY_CONFIG.providers.gemini.model,
  modelVersion: AI_GATEWAY_CONFIG.providers.gemini.modelVersion,
  domain: "general",
  taskTypes: GEMINI_TASK_TYPES,
  /**
   * Gemini's published context window is in the million-token range. The Gateway
   * caps assembled context far lower (`limits.maxContextChars`), so this is the
   * model's ceiling rather than a budget the router spends.
   */
  maxContextTokens: 1048576,
  maxOutputTokens: 8192,
  defaultTemperature: 0.3,
  deployment: "gemini",
  region: "external",
  supportsJsonMode: true,
});