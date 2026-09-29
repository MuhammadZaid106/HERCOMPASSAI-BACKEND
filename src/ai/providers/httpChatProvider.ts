import { createHash } from "node:crypto";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import {
  ModelProviderError,
  redactProviderText,
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
 * Redaction happens here rather than at each call site because both consumers
 * embed the result in text that leaves the transport: the failure message and the
 * health detail. Upstream providers do echo the token they were handed in 401
 * bodies, so an unredacted return value would put a live credential in a log
 * file. The body is also length-capped so a misconfigured or hostile endpoint
 * cannot stream an unbounded payload into a log.
 */
async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).slice(0, 2000);
    if (text.trim() === "") return null;

    let extracted: string;
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: unknown; code?: unknown; type?: unknown };
        message?: unknown;
      };
      const parts: string[] = [];
      if (typeof parsed.error?.message === "string") parts.push(parsed.error.message);
      else if (typeof parsed.message === "string") parts.push(parsed.message);
      if (typeof parsed.error?.code === "string") parts.push(`code=${parsed.error.code}`);
      else if (typeof parsed.error?.type === "string") parts.push(`type=${parsed.error.type}`);
      extracted = parts.length > 0 ? parts.join(" ") : text;
    } catch {
      // Not JSON — a proxy or gateway error page. The text is still the reason.
      extracted = text;
    }

    return redactProviderText(extracted);
  } catch {
    return null;
  }
}

/** First line of a detail string, for a one-line log message. */
function summariseDetail(detail: string | null): string | null {
  if (!detail) return null;
  const firstLine = detail.split("\n")[0].trim();
  return firstLine === "" ? null : firstLine.slice(0, 200);
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
        const kind = response.status >= 400 && response.status < 500 ? "rejected" : "unavailable";
        const detail = await readErrorDetail(response);
        throw new ModelProviderError(
          kind,
          this.name,
          `Provider "${this.name}" returned status ${response.status}${summariseDetail(detail) ? ` — ${summariseDetail(detail)}` : ""}`,
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
        status: response.status >= 400 && response.status < 500 ? "degraded" : "unavailable",
        latencyMs,
        detail: `Probe returned status ${response.status} for model "${this.config.model}"${summariseDetail(detail) ? ` - ${summariseDetail(detail)}` : ""}.`,
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

/** Node/libuv error codes that are worth naming, keyed to something readable. */
const TRANSPORT_ERROR_NAMES: Readonly<Record<string, string>> = {
  ENOTFOUND: "DNS lookup failed - the hostname does not resolve",
  EAI_AGAIN: "DNS lookup failed - the resolver did not answer",
  ECONNREFUSED: "connection refused - nothing is listening on that port",
  ECONNRESET: "connection reset by the endpoint",
  ETIMEDOUT: "connection timed out",
  EHOSTUNREACH: "host unreachable",
  ENETUNREACH: "network unreachable",
  EPIPE: "connection closed before the response was read",
  CERT_HAS_EXPIRED: "TLS certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "TLS certificate is self-signed and untrusted",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS certificate chain could not be verified",
};

/**
 * Extracts a safe, useful reason from a transport-level failure.
 *
 * A bare `fetch` rejection carries its cause in `name` and `code`, and neither is
 * self-describing: an aborted request reports `name: "TimeoutError"`, and a DNS
 * failure reports `code: "ENOTFOUND"`. Reporting "could not be reached" without
 * them collapses "wrong hostname", "nothing listening", "expired certificate" and
 * "the model is just slow" into one indistinguishable line, so this is what makes
 * the difference between a log an operator can act on and one they cannot.
 *
 * `code` is typed as a string but arrives as a number for libuv errors, so both
 * are accepted.
 */
function describeTransportFailure(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  // An abort is the most common cause and the least legible without this branch:
  // `TimeoutError` is what `AbortSignal.timeout` raises, and it arrives with a
  // numeric code that reads as nothing at all.
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "the request timed out before the engine answered";
  }

  for (const candidate of [error, (error as { cause?: unknown }).cause]) {
    if (!(candidate instanceof Error)) continue;

    const code = (candidate as { code?: unknown }).code;
    if (typeof code === "string" && code.trim() !== "") {
      return TRANSPORT_ERROR_NAMES[code] ?? code;
    }
    if (typeof code === "number" && Number.isFinite(code)) {
      return `platform error code ${code}`;
    }
  }

  return null;
}
