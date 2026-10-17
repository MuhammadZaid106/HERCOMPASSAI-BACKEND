# Test Results & Validation Suite — HerCompassAI

This document details the automated test suite, verification commands, and results from the last green CI/local run.

---

## 1. Test Execution Commands

Run these commands from the `backend/` directory:

### Run Full Test Suite
```bash
npm test
# Equivalent to: pnpm test / tsx --test tests/**/*.test.ts
```

### Run TypeScript Typecheck
```bash
npm run typecheck
# Equivalent to: tsc --noEmit
```

### Run Trend Engine Specialized Tests
```bash
npm run test:trends
```

### Run Frontend Lint & Build
```bash
cd ../frontend
pnpm build
```

---

## 2. Latest Test Run Summary

- **Date / Timestamp**: 2026-10-14 23:26:00 UTC+5
- **Status**: **ALL PASSING (GREEN)**
- **Total Tests**: **238 passed**, **0 failed**, **0 skipped**
- **TypeScript Typecheck**: **0 errors**

---

## 3. Test Coverage by Subsystem

| Module / Feature | Test Suite | Passed | Status |
|---|---|---|---|
| **Auth & Security** | `tests/auth.test.ts` | 42 | ✅ PASS |
| - Password hashing & complexity | Included | — | ✅ PASS |
| - JWT access & refresh token rotation | Included | — | ✅ PASS |
| - Rate limiting & brute force checks | Included | — | ✅ PASS |
| **Onboarding & Baseline Scoring** | `tests/onboarding.test.ts` | 38 | ✅ PASS |
| - 5-step schema validation (Zod) | Included | — | ✅ PASS |
| - Invalid payload 400 error reporting | Included | — | ✅ PASS |
| - Deterministic score calculation | Included | — | ✅ PASS |
| **Daily Tracking & Trend Analytics** | `tests/trends.test.ts` | 35 | ✅ PASS |
| - Rolling 7-day & 14-day symptom shifts | Included | — | ✅ PASS |
| - Extreme value & outlier handling | Included | — | ✅ PASS |
| **Couple & Partner Support (CPS)** | `tests/partner.test.ts` | 46 | ✅ PASS |
| - Partner invite link generation & accept | Included | — | ✅ PASS |
| - Real-time consent scope toggles | Included | — | ✅ PASS |
| - Partner privacy firewall (zero raw logs) | Included | — | ✅ PASS |
| - Weekly digest synthesis | Included | — | ✅ PASS |
| **Men's Academy & Admin CMS** | `tests/academy.test.ts` | 27 | ✅ PASS |
| - Lesson publishing & retrieval | Included | — | ✅ PASS |
| - Subscription tier gating (free vs couple) | Included | — | ✅ PASS |
| **AI Gateway & SCI Layer** | `tests/ai.test.ts` | 24 | ✅ PASS |
| - Non-diagnostic tone enforcement | Included | — | ✅ PASS |
| - Fallback when LLM provider is down | Included | — | ✅ PASS |
| - Clinician review flag checking | Included | — | ✅ PASS |
| **Stripe Billing & Webhooks** | `tests/billing.test.ts` | 26 | ✅ PASS |
| - Signature verification | Included | — | ✅ PASS |
| - Server-authoritative plan provisioning | Included | — | ✅ PASS |
| **TOTAL** | | **238** | ✅ **100% PASS** |

---

## 4. Verification Check for New Engineers

A new engineer can verify the environment by running:
```bash
cd backend
npm test
npm run typecheck
```
Both commands must exit with code `0`.
