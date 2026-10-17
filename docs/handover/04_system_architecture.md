# System Architecture — HerCompassAI

HerCompassAI is a **relationship-centered + workforce intelligence SaaS platform** designed for women navigating perimenopause, menopause, and midlife health, alongside their partners.

---

## 1. Core Architectural Tenet

> **Deterministic Software Calculates; AI Interprets.**
> 
> Numeric scores, trend detection (+22% hot flashes), symptom frequency, streaks, subscription limits, and partner consent scopes are calculated deterministically by tested TypeScript services.
> 
> AI Models (Llama 3 / Med42 / OpenAI via the HerCompass AI Gateway) interpret these verified metrics into empathetic, non-diagnostic observational insights.

---

## 2. High-Level Architecture Diagram

```
       +-------------------------------------------------------+
       |                  Frontend (Next.js)                   |
       |  - Member Dashboard        - Partner Portal (Digest)  |
       |  - Menopause Snapshot      - Men's Academy            |
       |  - Nutrition & Symptoms    - Admin CMS                |
       +---------------------------+---------------------------+
                                   | HTTP / REST (JWT)
                                   v
       +-------------------------------------------------------+
       |               Backend (Express + TypeScript)          |
       |  Middleware:                                          |
       |    - Helmet (Security headers)                        |
       |    - CORS & Express Rate Limit                        |
       |    - AuthMiddleware (JWT verification & RLS session)  |
       |                                                       |
       |  Controllers & Services:                              |
       |    - Auth (Registration, Verification, Refresh)       |
       |    - Onboarding & Snapshot Metric Engine              |
       |    - Daily Logs & Trend Engine                        |
       |    - Couple & Partner Support (CPS) Service           |
       |    - Billing & Stripe Webhook Engine                  |
       |    - AI Gateway & SCI Layer                           |
       +---------------------------+---------------------------+
                     |                          |
                     v                          v
       +---------------------------+  +------------------------+
       | Neon PostgreSQL           |  | LLM / AI Gateway       |
       | - Row Level Security (RLS)|  | - Med42 / Llama 3      |
       | - pgvector for RAG        |  | - SCI Guardrail Filter |
       | - Sequelize ORM Models    |  +------------------------+
       +---------------------------+
```

---

## 3. Subsystem Breakdown

### A. Authentication & Session Management
- **Short-lived Access Tokens (JWT)**: Expire in 15 minutes, passed in `Authorization: Bearer <token>`.
- **Rotated Refresh Tokens**: Stored hashed in PostgreSQL with expiration and revocation mechanisms.
- **Role-Based Access Control**: `member`, `partner`, `admin`, `clinician`.

### B. Couple & Partner Support (CPS) & Privacy Firewall
- **Zero Raw Data Sharing**: Partners never receive raw symptom logs, emotional journal entries, or private trackers.
- **Consented Partner Digest**: Partners only receive an aggregate weekly digest highlighting supportive empathy tips and communication guidelines.
- **Revocable Scopes**: Consent scopes can be revoked instantly by the member at any time.

### C. Safety, Compliance & Intelligence (SCI) Layer
- Every prompt and model output passes through the SCI layer.
- **Tone Guard**: Enforces non-diagnostic phrasing (e.g., *"Your logs suggest..."* instead of *"You have..."*).
- **Clinical Review / Grounding**: Grounded in gold-standard publications (NAMS, ACOG, WHO, Harvard Health).
- Clinician review tracking via `human_reviews` / audit tables.

### D. Billing & Entitlement Engine
- Built with Stripe Customer Portal and Webhook events.
- Client requests verify server-side entitlements directly against PostgreSQL state, never trusting client-supplied plan names or price IDs.
