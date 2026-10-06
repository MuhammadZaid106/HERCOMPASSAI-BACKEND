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
  /** Public site used in email links. Falls back to the first CORS origin. */
  FRONTEND_URL: z.string().default(""),
  SMTP_USER: z.string().default(""),
  SMTP_APP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().default(""),

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
   */
  AI_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  /**
   * Budget for the admin health probe.
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

  /**
   * Google Gemini, on its native `generateContent` API.
   */
  GEMINI_PROVIDER_URL: z.string().default(""),
  GEMINI_PROVIDER_KEY: z.string().default(""),
  /** Model id without the `models/` prefix, e.g. `gemini-3.8-flash`. */
  GEMINI_MODEL: z.string().default(""),
  GEMINI_MODEL_VERSION: z.string().default(""),

  // ─── Stripe Payments & Billing ──────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PLUS_PRICE_ID_MONTHLY: z.string().default(""),
  STRIPE_PLUS_PRICE_ID_ANNUAL: z.string().default(""),
  STRIPE_PREMIUM_PRICE_ID_MONTHLY: z.string().default(""),
  STRIPE_PREMIUM_PRICE_ID_ANNUAL: z.string().default(""),
  STRIPE_SUCCESS_URL: z.string().default(""),
  STRIPE_CANCEL_URL: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ [ENV] Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
