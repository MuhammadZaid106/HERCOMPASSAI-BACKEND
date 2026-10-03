import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { GeminiProvider } from "../../src/ai/providers/gemini.provider.js";
import { ModelProviderError } from "../../src/ai/types/index.js";
import type { ModelGenerationRequest } from "../../src/ai/types/index.js";

/**
 * Wire-dialect tests for the Gemini adapter.
 *
 * Gemini does not speak the OpenAI chat-completions dialect the other two
 * engines share, so this translation is the part that can be wrong in ways no
 * amount of routing will reveal: a `system` message sent as a conversation turn
 * instead of `systemInstruction` is a silently weakened safety prompt, and a
 * `SAFETY` finish reason reported as `stop` is a complete Snapshot containing
 * nothing. Both produce a 200 with plausible-looking output, which is exactly
 * the failure mode a status-code test cannot see.
 */

const SECRET = "AIzaSySuperSecretKeyValueThatMustNeverLeak0123456789";

const REQUEST: ModelGenerationRequest = {
  requestId: "33333333-3333-4333-8333-333333333333",
  taskType: "structured_generation",
  messages: [
    { role: "system", content: "You are a wellness educator. Never diagnose." },
    { role: "user", content: "Summarise this week." },
    { role: "assistant", content: "Here is the week." },
  ],
  temperature: 0.3,
  maxOutputTokens: 512,
  timeoutMs: 1000,
  responseFormat: "json_object",
  metadata: {},
};

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Builds a provider whose single endpoint answers with `status` and `body`. */
function providerAnswering(
  status: number,
  body: unknown,
  overrides: Partial<Parameters<typeof buildConfig>[0]> = {}
): GeminiProvider {
  const captured: Captured[] = [];
  const provider = new GeminiProvider({
    ...buildConfig({
      fetchImpl: (async (url: string, init: RequestInit) => {
        captured.push({
          url: String(url),
          headers: (init.headers ?? {}) as Record<string, string>,
          body: JSON.parse(String(init.body)),
        });
        return new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch,
    }),
    ...overrides,
  });
  (provider as unknown as { captured: Captured[] }).captured = captured;
  return provider;
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: "gemini",
    baseUrl: "https://generativelanguage.example.invalid/v1beta",
    apiKey: SECRET,
    model: "gemini-2.5-flash",
    modelVersion: "test",
    domain: "general",
    taskTypes: ["structured_generation"],
    maxContextTokens: 1048576,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    deployment: "gemini",
    region: "test",
    supportsJsonMode: true,
    ...overrides,
  };
}

/** The request the provider actually put on the wire. */
function capturedRequest(provider: GeminiProvider): Captured {
  const captured = (provider as unknown as { captured: Captured[] }).captured;
  assert.ok(captured.length > 0, "expected the provider to have called its endpoint");
  return captured[0];
}

async function captureError(promise: Promise<unknown>): Promise<ModelProviderError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ModelProviderError, "expected a ModelProviderError");
    return error;
  }
  assert.fail("expected the generation to fail");
}

const ANSWER = {
  candidates: [
    { content: { role: "model", parts: [{ text: '{"dominantFocusArea":"sleep"}' }] }, finishReason: "STOP" },
  ],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 },
};

describe("geminiProvider: request translation", () => {
  it("calls the native generateContent path, not the chat-completions path", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const { url } = capturedRequest(provider);
    assert.equal(
      url,
      "https://generativelanguage.example.invalid/v1beta/models/gemini-2.5-flash:generateContent"
    );
  });

  it("sends the system prompt as systemInstruction, not as a conversation turn", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const { body } = capturedRequest(provider);
    // A `system` entry inside `contents` is not a system instruction in this API.
    // Sent there it is either rejected or treated as ordinary user text, and a
    // dropped safety prompt reads downstream as a compliance failure.
    assert.deepEqual(body.systemInstruction, {
      role: "system",
      parts: [{ text: "You are a wellness educator. Never diagnose." }],
    });
    const contents = body.contents as Array<{ role: string }>;
    assert.ok(
      !contents.some((entry) => entry.role === "system"),
      "system must not appear as a content role"
    );
  });

  it("maps the assistant role onto Gemini's model role", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const { body } = capturedRequest(provider);
    assert.deepEqual(
      (body.contents as Array<{ role: string }>).map((entry) => entry.role),
      ["user", "model"]
    );
  });

  it("expresses JSON mode as a response MIME type", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const generationConfig = capturedRequest(provider).body.generationConfig as Record<string, unknown>;
    assert.equal(generationConfig.responseMimeType, "application/json");
    assert.equal(generationConfig.maxOutputTokens, 512);
    assert.equal(generationConfig.temperature, 0.3);
  });

  it("sends the key as a header rather than in the query string", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const { url, headers } = capturedRequest(provider);
    assert.equal(headers["x-goog-api-key"], SECRET);
    // A key in the URL lands in every proxy log and access log on the path.
    assert.ok(!url.includes(SECRET), "the credential must never appear in the URL");
  });

  it("omits systemInstruction entirely when there is no system message", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate({ ...REQUEST, messages: [{ role: "user", content: "hi" }] });

    const { body } = capturedRequest(provider);
    assert.ok(!("systemInstruction" in body), "an empty systemInstruction is a malformed request");
  });
});

describe("geminiProvider: response translation", () => {
  it("reads the text, finish reason and token usage from the native shape", async () => {
    const response = await providerAnswering(200, ANSWER).generate(REQUEST);

    assert.equal(response.provider, "gemini");
    assert.equal(response.content, '{"dominantFocusArea":"sleep"}');
    // `cleanFinish` in the confidence calculation is exactly this comparison, so
    // a mis-mapped STOP silently lowers confidence on every good answer.
    assert.equal(response.finishReason, "stop");
    assert.deepEqual(response.usage, { promptTokens: 11, completionTokens: 22, totalTokens: 33 });
  });

  it("does not let reasoning tokens consume the answer budget", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const generationConfig = capturedRequest(provider).body.generationConfig as Record<string, unknown>;
    // Reasoning tokens are drawn from maxOutputTokens. Left enabled, a thinking
    // model spends the route's whole allowance before writing anything and the
    // answer is cut off mid-string, which no recovery strategy in jsonPayload.ts
    // can close. Measured on gemini-3.8-flash: 863 thinking / 33 answer tokens at
    // a 900 budget, versus 0 / 714 with this set.
    assert.deepEqual(generationConfig.thinkingConfig, { thinkingBudget: 0 });
  });

  it("keeps the output budget whole for the answer", async () => {
    const provider = providerAnswering(200, ANSWER);
    await provider.generate(REQUEST);

    const generationConfig = capturedRequest(provider).body.generationConfig as Record<string, unknown>;
    // The budget must not be split, and must not be raised to paper over
    // truncation — the route owns the token limit, not the adapter.
    assert.equal(generationConfig.maxOutputTokens, 512);
  });

  it("joins text that arrives split across parts", async () => {
    const response = await providerAnswering(200, {
      candidates: [
        {
          content: { role: "model", parts: [{ text: '{"a":' }, { text: '1}' }] },
          finishReason: "STOP",
        },
      ],
    }).generate(REQUEST);

    assert.equal(response.content, '{"a":1}');
  });

  it("still reads a part with no thought flag as answer text", async () => {
    // Reasoning models report thinking through usageMetadata.thoughtsTokenCount,
    // not as flagged parts — gemini-3.8-flash returns a single unflagged part.
    const response = await providerAnswering(200, {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: '{"a":1}', thoughtSignature: "EvwPCvkPAWkUfRMlRcDZdMQ" }],
          },
          finishReason: "STOP",
        },
      ],
    }).generate(REQUEST);

    assert.equal(response.content, '{"a":1}');
  });

  it("maps a truncated answer to length rather than a clean stop", async () => {
    const response = await providerAnswering(200, {
      candidates: [{ content: { role: "model", parts: [{ text: "{}" }] }, finishReason: "MAX_TOKENS" }],
    }).generate(REQUEST);

    // Reporting MAX_TOKENS as "stop" would let a clipped answer pass as complete.
    assert.equal(response.finishReason, "length");
  });

  it("never reports a safety refusal as a clean finish", async () => {
    for (const finishReason of ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"]) {
      const response = await providerAnswering(200, {
        candidates: [
          { content: { role: "model", parts: [{ text: '{"dominantFocusArea":"sleep"}' }] }, finishReason },
        ],
      }).generate(REQUEST);

      assert.equal(response.finishReason, "content_filter", `${finishReason} must not read as stop`);
    }
  });
});

describe("geminiProvider: refusal and failure classification", () => {
  it("names the block reason when the prompt is blocked before generation", async () => {
    // Gemini reports this with no `candidates` array at all. Without this the
    // adapter reports "returned an empty completion", which sends an operator
    // hunting a transport fault for a model that simply declined.
    const error = await captureError(
      providerAnswering(200, { promptFeedback: { blockReason: "SAFETY" } }).generate(REQUEST)
    );

    assert.equal(error.kind, "invalid_response");
    assert.match(error.message, /blocked the prompt/i);
    assert.match(error.message, /SAFETY/);
    assert.equal(error.retryable, false, "the same prompt is refused identically on a retry");
  });

  it("names the block reason when generation is blocked partway through", async () => {
    const error = await captureError(
      providerAnswering(200, { candidates: [{ finishReason: "PROHIBITED_CONTENT", content: {} }] }).generate(
        REQUEST
      )
    );

    assert.match(error.message, /no content/i);
    assert.match(error.message, /PROHIBITED_CONTENT/);
  });

  it("reports a genuinely empty answer as an empty completion, not a refusal", async () => {
    const error = await captureError(providerAnswering(200, { candidates: [] }).generate(REQUEST));

    assert.match(error.message, /empty completion/i);
  });

  it("classifies an unknown model id as a non-retryable rejection", async () => {
    const error = await captureError(
      providerAnswering(
        404,
        JSON.stringify({ error: { message: "models/gemini-9.9-ultra is not found.", status: "NOT_FOUND" } })
      ).generate(REQUEST)
    );

    assert.equal(error.kind, "rejected");
    assert.equal(error.httpStatus, 404);
    assert.equal(error.retryable, false);
    assert.match(error.detail ?? "", /NOT_FOUND/);
  });

  it("classifies a rejected key as a permanent refusal, not an outage", async () => {
    const error = await captureError(
      providerAnswering(
        403,
        JSON.stringify({ error: { message: "API key not valid", status: "PERMISSION_DENIED" } })
      ).generate(REQUEST)
    );

    assert.equal(error.kind, "rejected");
    assert.equal(error.retryable, false);
  });

  it("treats rate limiting as retryable and a server error as an outage", async () => {
    const limited = await captureError(providerAnswering(429, "{}").generate(REQUEST));
    assert.equal(limited.kind, "rate_limited");
    assert.equal(limited.retryable, true);

    const down = await captureError(providerAnswering(503, "upstream unavailable").generate(REQUEST));
    assert.equal(down.kind, "unavailable");
    assert.equal(down.retryable, true);
  });
});

describe("geminiProvider: diagnostic safety", () => {
  it("redacts the Google key echoed by an upstream error", async () => {
    const error = await captureError(
      providerAnswering(400, JSON.stringify({ error: { message: `Bad key ${SECRET} supplied.` } })).generate(
        REQUEST
      )
    );

    assert.ok(!(error.detail ?? "").includes(SECRET), "the credential must never be retained");
  });

  it("never returns the credential in the health detail", async () => {
    const health = await providerAnswering(401, `key ${SECRET} is invalid`).healthCheck();

    assert.equal(health.status, "degraded");
    assert.ok(!(health.detail ?? "").includes(SECRET));
  });

  it("names the rejected model so the operator knows what to change", async () => {
    const health = await providerAnswering(
      404,
      JSON.stringify({ error: { message: "not found", status: "NOT_FOUND" } })
    ).healthCheck();

    assert.ok(health.detail?.includes("gemini-2.5-flash"));
  });
});

describe("geminiProvider: endpoint identity", () => {
  it("matches two registrations of the same model and host despite different labels", () => {
    const flash = providerAnswering(200, ANSWER, { deployment: "gemini" });
    const sameFlash = providerAnswering(200, ANSWER, { deployment: "flash-fallback" });

    assert.ok(flash.getEndpointIdentity());
    assert.equal(flash.getEndpointIdentity(), sameFlash.getEndpointIdentity());
  });

  it("separates different weights on the same host", () => {
    const flash = providerAnswering(200, ANSWER, { model: "gemini-2.5-flash" });
    const pro = providerAnswering(200, ANSWER, { model: "gemini-2.5-pro" });

    assert.notEqual(flash.getEndpointIdentity(), pro.getEndpointIdentity());
  });

  it("returns null when the engine is not configured, so nothing is wrongly deduped", () => {
    assert.equal(providerAnswering(200, ANSWER, { baseUrl: "" }).getEndpointIdentity(), null);
  });
});