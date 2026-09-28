import { ModelProviderError, type ModelProviderName } from "../types/index.js";

/**
 * Spec corrector.
 *
 * Providers wrap JSON in prose or fenced code blocks, truncate it, or append
 * commentary. Rather than trusting the raw string we recover the payload
 * deterministically: strip fences, take the outermost balanced object, then
 * validate. If nothing parses we surface a classified provider error so the
 * Gateway can fall back — we never ship a half-parsed response to a user.
 */

const FENCE_PATTERN = /```(?:json|JSON)?\s*([\s\S]*?)```/;

function stripCodeFence(text: string): string {
  const match = text.match(FENCE_PATTERN);
  return match && match[1] ? match[1] : text;
}

/** Finds the first balanced `{...}` region, ignoring braces inside JSON strings. */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/** Truncates an unterminated object so a cut-off response can still be inspected. */
function closeTruncatedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  const candidate = text.slice(start);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of candidate) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
  }

  if (inString) return null;
  return candidate.slice(0, candidate.lastIndexOf("}") + 1) || null;
}

export function extractJsonObject(
  rawContent: string,
  provider: ModelProviderName
): Record<string, unknown> {
  const attempts: Array<() => string | null> = [
    () => rawContent,
    () => stripCodeFence(rawContent),
    () => extractBalancedObject(rawContent),
    () => extractBalancedObject(stripCodeFence(rawContent)),
    () => closeTruncatedObject(rawContent),
  ];

  for (const build of attempts) {
    const candidate = build();
    if (!candidate) continue;

    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next recovery strategy.
    }
  }

  throw new ModelProviderError(
    "invalid_response",
    provider,
    "Provider response did not contain a recoverable JSON object"
  );
}
