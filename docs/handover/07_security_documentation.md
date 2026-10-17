# Security Documentation — HerCompassAI

HerCompassAI handles sensitive health, reproductive, and relationship data. This document outlines the security controls, policies, and safeguards enforced across the stack.

---

## 1. Authentication & Token Architecture

### Password Security
- Passwords are hashed using **`bcryptjs`** with a minimum of **12 salt rounds**.
- Passwords are never returned in database queries or API responses (`attributes: { exclude: ['password'] }`).
- Strict password complexity enforced via Zod schemas: minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special symbol.

### Access & Refresh Tokens
- **Access Tokens**: Short-lived (15 minutes), signed with `JWT_ACCESS_SECRET` using HMAC SHA-256. Payload contains minimal claims (`id`, `email`, `role`).
- **Refresh Tokens**: Long-lived (7 days), signed with `JWT_REFRESH_SECRET`. Stored as a hashed record in the `refresh_tokens` database table.
- **Token Rotation & Revocation**: Every refresh request invalidates the previous refresh token and issues a new pair. A user can revoke all active sessions on logout.

---

## 2. Database Isolation & Row Level Security (RLS)

- Neon Serverless PostgreSQL with mandatory SSL (`sslmode=require`).
- **Migration `016_database_rls.sql`**: Enables PostgreSQL Row Level Security on personal health tables (`onboarding_profiles`, `daily_logs`, `symptoms`, `consent_records`).
- Session context is set via `SET LOCAL app.current_user_id = '<user-id>'` on queries handling tenant data.

---

## 3. Network & Application Defense

### HTTP Headers (Helmet)
Express app is guarded with `helmet()` middleware:
- `Content-Security-Policy` (CSP) configured to disallow unsafe inline script execution.
- `Strict-Transport-Security` (HSTS) with preloading.
- `X-Frame-Options: DENY` preventing clickjacking.
- `X-Content-Type-Options: nosniff` preventing MIME sniffing.

### Rate Limiting
- Applied via `express-rate-limit`:
  - `/api/auth/login`: 5 requests per 15 minutes per IP to block brute-force.
  - `/api/auth/register`: 10 requests per hour per IP.
  - `/api/ai/*`: 30 requests per minute to prevent prompt-injection hammering and cost exhaustion.

### CORS Policy
- Express validates `Origin` against `FRONTEND_URL`.
- Credentials (`credentials: true`) allowed only for approved domains.

---

## 4. Input Validation & Strict Typing

- **Zod Runtime Validation**: 100% of incoming request bodies (`req.body`), query parameters (`req.query`), and route parameters (`req.params`) are validated with strict Zod schemas before reaching business logic controllers.
- Invalid requests fail fast with `400 Bad Request` containing structured error field paths, preventing SQL injection or parameter pollution.

---

## 5. Partner Privacy Firewall & SCI Safety Layer

- **Privacy Firewall**: Partners do not have read access to raw symptom, nutritional, or daily log records. All partner-facing data is compiled through the deterministic CPS aggregate digest generator.
- **Safety, Compliance & Intelligence (SCI)**:
  - System prompts strictly instruct the LLM gateway to never diagnose illnesses, prescribe medication, or offer clinical prognoses.
  - Responses pass an SCI tone-filter ensuring supportive, observational phrases (e.g. *"Your tracking shows..."*).
  - Grounding references to accredited bodies (NAMS, ACOG, WHO) are cited.
