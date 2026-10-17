# Changelog — HerCompassAI Milestone 2

All notable architectural and feature milestones completed during Milestone 2 development.

---

## [Milestone 2.0.0] — 2026-10-14

### Added
- **TypeScript Migration**: Converted 100% of backend and core frontend components to strict TypeScript (`.ts` / `.tsx`).
- **Complete Auth System**:
  - Secure registration, login, logout, and token refresh endpoints.
  - Email verification workflow and token-based password reset.
  - Google OAuth token validation via `google-auth-library`.
  - Passwords hashed with `bcryptjs` (12 rounds); JWT access tokens (15m) and refresh token rotation in database.
- **Onboarding & Menopause Snapshot**:
  - 5-step progressive disclosure UI adhering to Serene Orchid wellness design tokens.
  - Deterministic calculations for symptom burden, nutrition balance, and lifestyle baseline scores.
  - Zod runtime schema validation on both client and server.
- **Daily Health Logs & Trend Engine**:
  - Daily logging for sleep, mood, energy, and physical symptoms.
  - Deterministic trend calculations (`calculateTrends.ts`) detecting rolling 7-day and 14-day percentage shifts.
- **Couple & Partner Support (CPS)**:
  - Partner invitation links with unique cryptographic tokens.
  - Real-time revocable consent scopes table (`partner_consents`).
  - Strict Partner Privacy Firewall: zero raw health logs exposed to partner role.
  - Weekly Consented Partner Digest generation.
- **Men's Academy**:
  - Interactive lessons tailored for partners to understand biological and emotional changes.
  - Admin CMS lesson publishing and edition workflows.
  - Subscription tier gating (unlocked on Couple Support tier).
- **Billing & Stripe Integration**:
  - Server-authoritative checkout session creation.
  - Stripe webhook handler verifying signatures and updating user subscription tiers.
  - Stripe Customer Portal redirect endpoint.
- **Safety, Compliance & Intelligence (SCI) Layer**:
  - AI Gateway provider abstraction.
  - Non-diagnostic observational tone enforcement.
  - Clinical evidence grounding (NAMS, ACOG, WHO).
  - Clinician sign-off workflow via `human_reviews` / audit logs.
- **Database Security**:
  - Neon Serverless PostgreSQL with SSL connection pooling.
  - Row Level Security (RLS) migration `016_database_rls.sql` enforcing multi-tenant isolation.
- **Handover Documentation Pack (F18)**:
  - 11 comprehensive handover documents covering API, Setup, Deployment, Architecture, ADRs, Limitations, Security, Dependencies, Walkthrough, Changelog, and Test Results.

### Changed
- Fixed `onboardingController.ts` from throwing unhandled `ZodError` exceptions to returning structured `400 Bad Request` with per-field error messages.
- Standardized all API responses to `{ success: boolean, message: string, data?: any, errors?: any }`.
- Hardened CORS and Helmet headers for production security posture.
