/**
 * Test environment bootstrap.
 *
 * Loaded before any module under test (see the `test` script). `config/env.ts`
 * reads `process.env` at import time, so the values have to be in place first.
 *
 * The test run deliberately leaves DATABASE_URL empty: the AI audit service
 * treats that as "no database" and skips persistence, so the suite never touches
 * a real database.
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "test-access-secret-0000000000000000000000000000";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-0000000000000000000000000000";

// Allow the whole chain (med42, llama, gemini) to be attempted before
// the deterministic fallback serves. Production keeps the tighter latency budget.
process.env.AI_GATEWAY_MAX_FALLBACK_ATTEMPTS = "3";
