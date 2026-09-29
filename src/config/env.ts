import { z } from "zod";

/**
 * Environment flags arrive as strings. "false" must stay false, so we never use
 * Boolean() coercion here — an unset or blank value falls back to the default.
 */
function booleanFromEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") return defaultValue;
      return value.trim().toLowerCase() === "true" || value.trim() === "1";
    });
}

/**
 * Validates & exports all required environment variables.
 * Gracefully defaults in development to allow server boot even before Neon URL is provided.
 *
 * AI Gateway credentials are server-side only and must never be exposed to the browser.
 */
const envSchema = z.object({
  PORT: z.string().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default(""),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  /**
   * OAuth 2.0 client ID used to verify Google ID tokens.
   * Optional so deployments that do not use Google sign-in still boot;
   * POST /api/auth/google returns 503 when it is missing.
   */
  GOOGLE_CLIENT_ID: z.string().default(""),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // ─── HerCompass AI Gateway ───────────────────────────────────────────────────
  AI_GATEWAY_ENABLED: booleanFromEnv(true),
  AI_GATEWAY_SECRET: z.string().default(""),
  /** SCI = Self-Checking Integrity pass version. */
  AI_GATEWAY_SCI_VERSION: z.string().default("1.0"),
  /** Legacy alias kept so existing deployments keep working; prefer AI_GATEWAY_SCI_VERSION. */
  AI_GATEWAY_CI_VERSION: z.string().default(""),
  AI_GATEWAY_EVIDENCE_VERSION: z.string().default("1.0"),
  AI_GATEWAY_CONFIG_VERSION: z.string().default("1.0"),
  /**
   * Budget for a single generation attempt, covering the whole round trip.
   *
   * Sized for a full-length Snapshot answer rather than a typical one: the output
   * contract allows 1600 tokens, and a model that fills it on a shared router
   * needs well over the median, while an 8B model on the same router was measured
   * at 28 tok/s against 65 tok/s for a 70B. Measured end to end, a 70B Snapshot
   * completes in ~16s, so this leaves headroom for the long tail rather than
   * clipping a member's answer mid-sentence into the deterministic fallback.
   */
  AI_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  /**
   * Budget for the admin health probe.
   *
   * Unset by default, in which case it follows AI_GATEWAY_TIMEOUT_MS so it can
   * never be the stricter of the two. A probe that gives up sooner than the
   * request it is testing reports a working engine as unavailable, which is a
   * worse failure than no probe at all: it invents an outage and sends an
   * operator chasing a network problem that does not exist. That is not
   * hypothetical — a 5s probe reported an 8B model on a shared router as down
   * while the same model answered in 3s.
   */
  AI_GATEWAY_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  AI_GATEWAY_MAX_FALLBACK_ATTEMPTS: z.coerce.number().int().min(0).max(3).default(1),
  AI_GATEWAY_EVIDENCE_MIN_RELEVANCE: z.coerce.number().min(0).max(1).default(0.12),

  // ─── Model Providers (replaceable engines behind the Gateway) ───────────────
  LLAMA_PROVIDER_URL: z.string().default(""),
  LLAMA_PROVIDER_KEY: z.string().default(""),
  LLAMA_MODEL: z.string().default(""),
  LLAMA_MODEL_VERSION: z.string().default(""),

  MED42_PROVIDER_URL: z.string().default(""),
  MED42_PROVIDER_KEY: z.string().default(""),
  MED42_MODEL: z.string().default(""),
  MED42_MODEL_VERSION: z.string().default(""),

  OPENAI_COMPATIBLE_PROVIDER_URL: z.string().default(""),
  OPENAI_COMPATIBLE_PROVIDER_KEY: z.string().default(""),
  OPENAI_COMPATIBLE_MODEL: z.string().default(""),
  OPENAI_COMPATIBLE_MODEL_VERSION: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ [ENV] Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
