import { redactProviderText } from "../types/index.js";

/**
 * Transport helpers shared by every provider adapter.
 *
 * Two adapters speak different wire dialects — `HttpChatProvider` speaks
 * OpenAI-style chat completions, `GeminiProvider` speaks Google's native
 * `generateContent` — but they fail in exactly the same ways and those failures
 * are what an operator has to act on. Keeping the classification here means a new
 * dialect cannot accidentally report a bad model id as a transient outage.
 *
 * Security: nothing in this module ever returns a credential. Provider error
 * bodies are redacted and length-capped before they are returned, because both
 * consumers (the failure message and the health detail) embed the result in text
 * that leaves the transport, and hosted APIs do echo rejected keys in 401 bodies.
 */

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
export function describeTransportFailure(error: unknown): string | null {
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

/**
 * Extracts the provider's own explanation from an error body.
 *
 * Every provider returns a machine-readable `error` object, and its `message` is
 * the difference between "this model id is wrong" and "this token is invalid" —
 * two problems with two completely different fixes. Discarding the body is what
 * reduced both to the word "unavailable".
 *
 * Redaction happens here rather than at each call site because both consumers
 * embed the result in text that leaves the transport: the failure message and the
 * health detail. Upstream providers do echo the token they were handed in 401
 * bodies, so an unredacted return value would put a live credential in a log
 * file. The body is also length-capped so a misconfigured or hostile endpoint
 * cannot stream an unbounded payload into a log.
 */
export async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).slice(0, 2000);
    if (text.trim() === "") return null;

    let extracted: string;
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: unknown; code?: unknown; type?: unknown; status?: unknown };
        message?: unknown;
      };
      const parts: string[] = [];
      if (typeof parsed.error?.message === "string") parts.push(parsed.error.message);
      else if (typeof parsed.message === "string") parts.push(parsed.message);
      if (typeof parsed.error?.code === "string") parts.push(`code=${parsed.error.code}`);
      else if (typeof parsed.error?.status === "string") parts.push(`status=${parsed.error.status}`);
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
export function summariseDetail(detail: string | null): string | null {
  if (!detail) return null;
  const firstLine = detail.split("\n")[0].trim();
  return firstLine === "" ? null : firstLine.slice(0, 200);
}

/**
 * A refusal and an outage are different problems with different fixes.
 *
 * A 4xx is the engine telling us it will never serve this request — a model id it
 * does not host, or a key it will not accept. Reporting that as "unavailable" is
 * what makes a permanent misconfiguration look like a transient outage, and
 * nothing about a bad model id is fixed by retrying.
 */
export function isPermanentRejection(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500;
}

/** One-line `— provider's own words` suffix for an error message. */
export function formatStatusSuffix(detail: string | null): string {
  const summary = summariseDetail(detail);
  return summary ? ` — ${summary}` : "";
}