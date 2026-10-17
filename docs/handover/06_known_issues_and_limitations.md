# Known Issues & Limitations — HerCompassAI M2

This document details known limitations, edge cases, and design constraints in Milestone 2.

---

## 1. Men's Academy Subscription Gating
- **Behavior**: When a partner attempts to access Men's Academy lessons via `GET /api/partner/academy`, if the linked member is on the free plan, the API returns HTTP 200 with `{ requiresUpgrade: true, lessons: [] }`.
- **Reason**: Entitlement rule strictly enforces that full Men's Academy curriculum is part of the Couple Support tier.
- **Action**: Test users must simulate or assign a `couple` subscription tier to unlock full academy content.

---

## 2. Local Email Delivery in Development
- **Behavior**: If `SMTP_HOST` or `SMTP_PASS` are not provided in `backend/.env`, transactional emails (activation, password reset) log their tokens to the console/terminal instead of failing silently or crashing.
- **Action**: In local development, check the backend terminal output for verification URLs. For production, configure Resend or SendGrid SMTP credentials.

---

## 3. Clinician Review Audit Requirement (`fullyClinicianReviewed`)
- **Behavior**: `GET /api/ai/health` returns `fullyClinicianReviewed: false` until a clinician account reviews and signs off on evidence documents in the CMS.
- **Design Intent**: Safety Compliance & Intelligence (SCI) rule guarantees that unreviewed medical evidence is explicitly marked unverified.

---

## 4. In-Memory Rate Limiting (Single-Node Boundary)
- **Behavior**: Rate limits (e.g. 5 requests per 15 minutes on `/api/auth/login`) are kept in Node.js process memory.
- **Limitation**: Restarting the backend server resets rate limit buckets. Multi-container clustering will require enabling the Redis store adapter documented in ADR 002.

---

## 5. NextAuth & Backend Dual Session Coordination
- **Behavior**: Frontend uses NextAuth for cookie/session wrapping, while Backend uses stateless Bearer JWTs.
- **Requirement**: Ensure `NEXTAUTH_SECRET` and `JWT_ACCESS_SECRET` are both populated and valid; token refresh calls must be dispatched before access token expiry (15m).
