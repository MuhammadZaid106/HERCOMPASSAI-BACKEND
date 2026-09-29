import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { HttpChatProvider } from "../../src/ai/providers/httpChatProvider.js";
import { AI_GATEWAY_CONFIG } from "../../src/config/aiGateway.js";
import { ModelProviderError, toClientSafeProviderMessage } from "../../src/ai/types/index.js";
import type { ModelGenerationRequest } from "../../src/ai/types/index.js";

/**
 * Failure classification for the HTTP engines.
 *
 * This is the regression that made the Gateway look healthy while returning
 * nothing useful: an unsupported model id comes back as HTTP 400, and the
 * transport reported every non-2xx response as "unavailable". The log therefore
 * read as a transient outage when the actual cause was a permanent
 * misconfiguration, and the provider's own explanation was discarded before it
 * could reach an operator.
 *
 * These tests pin the classification, the capture of the upstream message, and
 * the boundary that keeps credentials and hostnames out of anything a client or
 * a member can see.
 */

const SECRET = "hf_superSecretTokenValueThatMustNeverLeak0123456789";

const REQUEST: ModelGenerationRequest = {
  requestId: "22222222-2222-4222-8222-222222222222",
  taskType: "structured_generation",
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: "user" },
  ],
  temperature: 0.2,
  maxOutputTokens: 512,
  timeoutMs: 1000,
  responseFormat: "json_object",
  metadata: {},
};

/** Builds a provider whose single endpoint answers with `status` and `body`. */
function providerAnswering(status: number, body: string): HttpChatProvider {
  return new HttpChatProvider({
    name: "llama",
    baseUrl: "https://router.example.invalid",
    apiKey: SECRET,
    model: "meta-llama/Llama-3.2-3B-Instruct",
    modelVersion: "test",
    domain: "general",
    taskTypes: ["structured_generation"],
    maxContextTokens: 8192,
    maxOutputTokens: 2048,
    defaultTemperature: 0.2,
    deployment: "test",
    region: "test",
    chatPath: "/v1/chat/completions",
    supportsJsonMode: true,
    fetchImpl: async () =>
      new Response(body, { status, headers: { "Content-Type": "application/json" } }),
  });
}

const MODEL_NOT_SUPPORTED = JSON.stringify({
  error: {
    message: "The model meta-llama/Llama-3.2-3B-Instruct does not exist or you do not have access to it.",
    type: "not_found_error",
    code: "model_not_supported",
  },
});

/** Asserts the promise rejects with a ModelProviderError, returning it. */
async function captureError(promise: Promise<unknown>): Promise<ModelProviderError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ModelProviderError, "expected a ModelProviderError");
    return error;
  }
  assert.fail("expected the generation to fail");
}

describe("httpChatProvider: upstream status classification", () => {
  it("classifies an unsupported model id as a non-retryable rejection", async () => {
    const error = await captureError(
      providerAnswering(400, MODEL_NOT_SUPPORTED).generate(REQUEST)
    );

    // A 400 is the engine saying it will never serve this request. Reporting it
    // as "unavailable" implies a blip worth retrying, and that mismatch is what
    // hid a permanent misconfiguration behind a transient-looking log line.
    assert.equal(error.kind, "rejected");
    assert.equal(error.httpStatus, 400);
    assert.equal(error.retryable, false);
    assert.equal(error.provider, "llama");
  });

  it("keeps the provider's own explanation so an operator can act on it", async () => {
    const error = await captureError(
      providerAnswering(400, MODEL_NOT_SUPPORTED).generate(REQUEST)
    );

    // Without the upstream code, the only available action is guessing.
    assert.ok(error.detail, "the upstream explanation must be captured");
    assert.match(error.detail, /model_not_supported/);
    assert.match(error.detail, /does not exist or you do not have access/);
    // The failure kind and status must be readable from the message too, so a
    // log line that prints only the message is still diagnosable.
    assert.match(error.message, /400/);
  });

  it("classifies a bad credential as rejected, not unavailable", async () => {
    const error = await captureError(
      providerAnswering(
        401,
        JSON.stringify({ error: { message: "Invalid credentials in Authorization header." } })
      ).generate(REQUEST)
    );

    assert.equal(error.kind, "rejected");
    assert.equal(error.httpStatus, 401);
    assert.equal(error.retryable, false);
  });

  it("treats rate limiting as retryable", async () => {
    const error = await captureError(
      providerAnswering(429, JSON.stringify({ error: { message: "Rate limit reached" } })).generate(
        REQUEST
      )
    );

    assert.equal(error.kind, "rate_limited");
    assert.equal(error.httpStatus, 429);
    assert.equal(error.retryable, true);
  });

  it("treats a server error as a retryable outage", async () => {
    const error = await captureError(
      providerAnswering(503, "upstream is down").generate(REQUEST)
    );

    assert.equal(error.kind, "unavailable");
    assert.equal(error.httpStatus, 503);
    assert.equal(error.retryable, true);
  });

  it("reads a non-JSON error body, since a proxy error page is still the reason", async () => {
    const error = await captureError(
      providerAnswering(502, "<html><body>502 Bad Gateway</body></html>").generate(REQUEST)
    );

    assert.equal(error.kind, "unavailable");
    assert.ok(error.detail?.includes("Bad Gateway"));
  });
});

describe("httpChatProvider: diagnostic safety", () => {
  it("redacts the configured credential from a captured error body", async () => {
    const error = await captureError(
      providerAnswering(
        400,
        JSON.stringify({
          error: {
            message: `Invalid API token ${SECRET} for model x.`,
            code: "invalid_api_key",
          },
        })
      ).generate(REQUEST)
    );

    // Hugging Face echoes the token it was given in some error payloads. Keeping
    // the body is what makes the log useful; failing to redact it would put a
    // live credential in a log file.
    const serialised = `${error.message} ${error.detail ?? ""} ${JSON.stringify(error.options ?? {})}`;
    assert.ok(!serialised.includes(SECRET), "the credential must never be retained");
    assert.match(error.detail ?? "", /invalid_api_key/);
  });

  it("keeps the client message free of engine, model and provider detail", async () => {
    const error = await captureError(
      providerAnswering(400, MODEL_NOT_SUPPORTED).generate(REQUEST)
    );

    const clientMessage = toClientSafeProviderMessage(error.kind);

    assert.ok(!clientMessage.includes("llama"), "must not name the engine to a member");
    assert.ok(!clientMessage.includes("meta-llama"), "must not name the model to a member");
    assert.ok(!clientMessage.includes("model_not_supported"), "must not leak the provider payload");
    assert.ok(!clientMessage.includes(SECRET));
    // The member still needs to know their data is safe and what to do.
    assert.match(clientMessage, /try again/i);
  });

  it("redacts a bearer token echoed by an upstream error", async () => {
    const error = await captureError(
      providerAnswering(401, `Unauthorized: Authorization: Bearer ${SECRET}`).generate(REQUEST)
    );

    assert.ok(!(error.detail ?? "").includes(SECRET));
  });
});

describe("httpChatProvider: health probe diagnosis", () => {
  it("names the rejected model so the operator knows what to change", async () => {
    const health = await providerAnswering(400, MODEL_NOT_SUPPORTED).healthCheck();

    // "Probe returned status 400." is not actionable. The next step is to change
    // the model id, and the health surface is the only place that comparison is
    // appropriate.
    assert.equal(health.status, "degraded");
    assert.ok(health.detail?.includes("meta-llama/Llama-3.2-3B-Instruct"));
    assert.match(health.detail ?? "", /model_not_supported/);
  });

  it("reports a server error as unavailable rather than degraded", async () => {
    const health = await providerAnswering(503, "down").healthCheck();

    assert.equal(health.status, "unavailable");
  });

  it("never returns the credential in the health detail", async () => {
    const health = await providerAnswering(401, `token ${SECRET} rejected`).healthCheck();

    assert.ok(!(health.detail ?? "").includes(SECRET));
  });
});

describe("httpChatProvider: transport diagnosis", () => {
  /**
   * A probe that reports "unavailable" with no reason is not a diagnosis, and the
   * default it used to print was worse than silence: it named an outage that may
   * not exist. These cover the two transport failures that actually occur here —
   * an abort and a DNS failure — and assert the reason survives.
   */
  function providerWithFailingTransport(
    failure: () => unknown
  ): HttpChatProvider {
    return new HttpChatProvider({
      name: "llama",
      baseUrl: "https://router.example.invalid",
      apiKey: SECRET,
      model: "meta-llama/Llama-3.1-8B-Instruct",
      modelVersion: "test",
      domain: "general",
      taskTypes: ["structured_generation"],
      maxContextTokens: 8192,
      maxOutputTokens: 2048,
      defaultTemperature: 0.2,
      deployment: "test",
      region: "test",
      chatPath: "/v1/chat/completions",
      supportsJsonMode: true,
      fetchImpl: (async () => {
        throw failure();
      }) as unknown as typeof fetch,
    });
  }

  it("names an aborted request as a timeout instead of a silent outage", async () => {
    // `AbortSignal.timeout` raises exactly this: a numeric `code` and a
    // `TimeoutError` name, neither of which a string-only `code` check would read.
    const aborted = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
      code: 23,
    });
    const error = await captureError(providerWithFailingTransport(() => aborted).generate(REQUEST));

    assert.equal(error.kind, "unavailable");
    assert.ok(error.detail, "a transport failure must still say something useful");
    assert.match(error.detail, /timed out/i);
  });

  it("explains a DNS failure rather than reporting a generic outage", async () => {
    const dns = Object.assign(new TypeError("fetch failed"), { code: "ENOTFOUND" });
    const error = await captureError(providerWithFailingTransport(() => dns).generate(REQUEST));

    // "could not be reached" sends an operator to check the network; "the
    // hostname does not resolve" sends them to check the URL.
    assert.match(error.detail ?? "", /hostname does not resolve/);
  });

  it("names a refused connection", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), { code: "ECONNREFUSED" });
    const error = await captureError(providerWithFailingTransport(() => refused).generate(REQUEST));

    assert.match(error.detail ?? "", /connection refused/);
  });

  it("finds the code on the cause, which is where fetch puts it", async () => {
    const cause = Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" });
    const outer = new TypeError("fetch failed", { cause });
    const error = await captureError(providerWithFailingTransport(() => outer).generate(REQUEST));

    assert.match(error.detail ?? "", /hostname does not resolve/);
  });

  it("keeps the probe budget no stricter than the generation budget", () => {
    // This is the defect, pinned. The probe was hardcoded to 5s while generation
    // had 20s, so an 8B model on a shared router �?" which answers a 1-token ping
    // in ~3s but not two at once �?" was reported "unavailable" by the very check
    // meant to prove it was available.
    assert.ok(
      AI_GATEWAY_CONFIG.limits.healthTimeoutMs >= AI_GATEWAY_CONFIG.limits.timeoutMs,
      `probe budget ${AI_GATEWAY_CONFIG.limits.healthTimeoutMs}ms must not be stricter than the generation budget ${AI_GATEWAY_CONFIG.limits.timeoutMs}ms`
    );
  });

  describe("endpoint identity for fallback deduplication", () => {
    function engine(overrides: Partial<Parameters<typeof providerAnswering>[0]> = {}) {
      return new HttpChatProvider({
        name: "llama",
        baseUrl: "https://router.example.invalid",
        apiKey: SECRET,
        model: "meta-llama/Llama-3.1-8B-Instruct",
        modelVersion: "test",
        domain: "general",
        taskTypes: ["structured_generation"],
        maxContextTokens: 8192,
        maxOutputTokens: 2048,
        defaultTemperature: 0.2,
        deployment: "llama-3",
        region: "test",
        chatPath: "/v1/chat/completions",
        supportsJsonMode: true,
        fetchImpl: async () => new Response("{}", { status: 200 }),
        ...overrides,
      } as Parameters<typeof providerAnswering>[0]);
    }

    it("matches two registrations of the same host and model despite different labels", () => {
      // The real configuration: "med42" and "llama" carry different deployment
      // labels, so a label-based comparison never fires and a member waits for the
      // same failed endpoint twice.
      const med42 = engine({ name: "med42", deployment: "med42" });
      const llama = engine({ name: "llama", deployment: "llama-3" });
      assert.equal(med42.getEndpointIdentity(), llama.getEndpointIdentity());
    });

    it("separates different weights on the same host", () => {
      const small = engine({ name: "llama" });
      const large = engine({ name: "med42", model: "meta-llama/Llama-3.3-70B-Instruct" });
      assert.notEqual(small.getEndpointIdentity(), large.getEndpointIdentity());
    });

    it("separates different hosts running the same model", () => {
      const primary = engine({ name: "llama" });
      const failover = engine({ name: "med42", baseUrl: "https://failover.example.invalid" });
      assert.notEqual(primary.getEndpointIdentity(), failover.getEndpointIdentity());
    });

    it("treats a trailing slash on the host as the same endpoint", () => {
      const plain = engine({ name: "llama" });
      const slashed = engine({ name: "med42", baseUrl: "https://router.example.invalid/" });
      assert.equal(plain.getEndpointIdentity(), slashed.getEndpointIdentity());
    });

    it("never exposes the host or the key", () => {
      const identity = engine({ name: "llama" }).getEndpointIdentity();
      assert.ok(identity);
      assert.ok(
        !identity.includes("router.example.invalid"),
        "identity must not leak the hostname"
      );
      assert.ok(!identity.includes(SECRET), "identity must not leak the key");
    });

    it("returns null when the engine is not configured, so nothing is wrongly deduped", () => {
      const unconfigured = engine({ name: "llama", baseUrl: "", apiKey: "" });
      assert.equal(unconfigured.getEndpointIdentity(), null);
    });
  });
});
