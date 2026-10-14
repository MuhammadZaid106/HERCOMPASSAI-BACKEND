# Architectural Decision Records (ADRs) — HerCompassAI

This document compiles the key architectural decisions made across Milestone 2.

---

## ADR 001: PostgreSQL Row Level Security (RLS) for Multi-Tenant Isolation

### Status: Accepted & Implemented (Migration 016)

### Context
HerCompassAI handles sensitive health, hormonal, emotional, and partner data. Relying purely on application-level `WHERE user_id = :id` queries leaves the application vulnerable to developer oversight or SQL injection leaks.

### Decision
Implement Row Level Security (RLS) directly in PostgreSQL via migration `016_database_rls.sql`.
- Tenant context is set per transaction via `SET LOCAL app.current_user_id = '<user-uuid>';`.
- Tables (`onboarding_profiles`, `daily_logs`, `symptoms`, `partner_digests`, `consent_records`) enforce security policies where `user_id = current_setting('app.current_user_id')::uuid`.
- Service bypass roles (such as background cron workers) connect via an isolated administrative role with explicit audit logging.

### Consequences
- **Positive**: Defense-in-depth data isolation at the storage layer. Even if an application bug omits a filter, cross-tenant data leaks are impossible.
- **Trade-off**: Database connection pooling must reset or cleanly scope session variables per query execution.

---

## ADR 002: Redis Caching & Distributed Rate-Limiting Strategy for M2

### Status: Deferred (In-Memory Fallback for Single-Node / Serverless M2)

### Context
HerCompassAI requires API rate limiting (auth routes, AI generation, brute-force protection) and session caching. Redis is common for multi-instance distributed deployments.

### Decision
For Milestone 2:
- Utilize Node.js in-memory stores (`express-rate-limit` with `MemoryStore`) on single-node instances and local environments.
- Architectural hooks and an abstract cache/rate-limit interface (`RateLimiterStore`) are in place.
- **Defer external Redis cluster deployment** to production horizontal scaling (Milestone 3 / Kubernetes deployment).

### Consequences
- **Positive**: Zero external Redis dependency required for local development and initial staging deploys; zero operational overhead during MVP testing.
- **Trade-off**: Rate limits do not share state across horizontally scaled multi-pod clusters until Redis adapter is activated via `REDIS_URL`.

---

## ADR 003: Stripe Price Trust & Server-Authoritative Entitlements

### Status: Accepted & Implemented

### Context
Clients can manipulate frontend payloads. If a client sends `{ plan: "premium", priceId: "price_123" }`, trusting this would allow price-tampering exploits.

### Decision
- The frontend **never dictates subscription prices or tier entitlements**.
- The client only requests a checkout session by tier identifier (e.g. `core_monthly` or `couple_monthly`).
- The backend maps this tier to pre-configured, validated Stripe Price IDs stored in environment variables (`STRIPE_PRICE_CORE_MONTHLY`, etc.).
- Tier entitlements are updated **exclusively** upon receipt and signature verification of Stripe webhook events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`).

### Consequences
- **Positive**: Absolute billing integrity; impossible for clients to forge subscriptions or spoof active tiers.

---

## ADR 004: Explicit Consent Scopes & Partner Privacy Firewall

### Status: Accepted & Implemented

### Context
The Couple & Partner Support (CPS) feature allows partners to support women in perimenopause and menopause. However, health and mood tracking must never compromise member privacy.

### Decision
- Store granular consent scopes in a dedicated `partner_consents` table (`share_digest: boolean`, `share_energy_trend: boolean`, `share_mood_trend: boolean`).
- Member has 1-click real-time revocation authority.
- Raw health and symptom tables are unreachable by partner roles.
- Partners only access aggregated, synthesized weekly digests created through the CPS Digest Generator service.

### Consequences
- **Positive**: Maximum user trust, HIPAA/GDPR ethical compliance alignment, preventing accidental over-sharing of deeply personal health records.
