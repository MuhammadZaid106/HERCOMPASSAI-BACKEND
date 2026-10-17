# API Documentation — HerCompassAI Backend

**Base URL (local):** `http://localhost:5000`  
**Base URL (production):** `https://hercompassai-backend.vercel.app`  
**All responses follow:** `{ success, message, data?, errors? }`

---

## Authentication

All protected routes require:
```
Authorization: Bearer <accessToken>
```

Tokens expire in **15 minutes**. Use `POST /api/auth/refresh` to renew silently.

---

## Auth Routes — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Register new member account |
| POST | `/login` | No | Login, returns `accessToken` + sets `refreshToken` cookie |
| POST | `/logout` | Yes | Revoke refresh token |
| POST | `/refresh` | Cookie | Issue new access token |
| GET | `/me` | Yes | Current user profile |
| POST | `/verify-email` | No | Verify email with token from link |
| POST | `/resend-verification` | Yes | Resend verification email |
| POST | `/forgot-password` | No | Send password reset link |
| POST | `/reset-password` | No | Reset password with token |
| POST | `/request-email-change` | Yes | Start email change (sends confirm link) |
| POST | `/confirm-email-change` | No | Complete email change with token |

### Register
```
POST /api/auth/register
Body: { name, email, password }
Returns: { accessToken, user: { id, email, role, plan } }
```

### Login
```
POST /api/auth/login
Body: { email, password }
Returns: { accessToken, user }
```

---

## Onboarding Routes — `/api/onboarding`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Member | Submit or update onboarding assessment |
| GET | `/snapshot` | Member | Get Personal Menopause Snapshot |
| GET | `/snapshot?refresh=true` | Member | Force regenerate snapshot |
| POST | `/snapshot/feedback` | Member | Submit snapshot rating |
| GET | `/status` | Member | Onboarding completion status |

### Submit Onboarding
```
POST /api/onboarding/
Required body fields:
  consentAccepted: true (literal)
  consentVersion: "1.0"
  consentType: "wellness_personalization"
Optional fields:
  age, menopausePhase, hormoneTherapyStatus,
  primaryHealthConcerns[], moodBaseline{},
  activityLevel, weeklyExerciseMinutes,
  partnerEmail, partnerConsent, partnerSupportInterest
```

---

## Tracking Routes — `/api/tracking`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/symptoms` | Member | Log symptom entry |
| POST | `/mood` | Member | Log mood entry |
| POST | `/sleep` | Member | Log sleep entry |
| POST | `/energy` | Member | Log energy entry |
| POST | `/lifestyle` | Member | Log lifestyle entry |
| GET | `/summary` | Member | Aggregated recent logs |
| GET | `/:type/:id` | Member | Get single tracking entry (owner only) |
| DELETE | `/:type/:id` | Member | Delete single tracking entry (owner only) |

---

## Member Routes — `/api/member`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/account` | Member | Account details |
| PATCH | `/account/consent` | Member | Update consent |
| GET | `/account/consents` | Member | Full consent history |
| GET | `/account/export` | Member | Download personal data (JSON) |
| GET | `/goals` | Member | List member goals |
| GET | `/subscription` | Member | Current plan + usage |
| GET | `/library` | Member | Saved content |
| POST | `/library/:id` | Member | Save content piece |
| DELETE | `/library/:id` | Member | Unsave content piece |
| GET | `/notifications` | Member | Notification list |
| PATCH | `/notifications/:id/read` | Member | Mark read |
| GET | `/notifications/preferences` | Member | Notification preferences |
| PUT | `/notifications/preferences` | Member | Update preferences |
| POST | `/partner/invite-link` | Member | Generate partner invite URL |
| GET | `/partner/status` | Member | Current partner connection |
| PATCH | `/partner/settings` | Member | Update sharing/scopes |
| DELETE | `/partner/revoke` | Member | Revoke partner access |

---

## AI Routes — `/api/ai`

All AI routes are **rate-limited** and require member auth.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/snapshot` | Member | Generate Personal Snapshot (alias) |
| POST | `/insight` | Member | Generate short daily insight |
| POST | `/generate` | Member | Spec-canonical alias; `feature` in body |
| POST | `/feedback` | Member | Rate an AI response |
| GET | `/health` | Admin/Dev | Gateway health, provider status, evidence review |

### /api/ai/generate
```
POST /api/ai/generate
Body: {
  feature?: "personal_snapshot" | "ai_insight",  // default: personal_snapshot
  promptVersion?: "v1",
  locale?: "en-GB" | "en-US"
}
Returns: { output, meta: { requestId, resultStatus, confidence, usage } }
```

---

## Partner Routes — `/api/partner`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/invite/:token` | No | Get invite details by token |
| POST | `/invite/:token/accept` | Partner account | Accept invite |
| POST | `/invite/:token/decline` | No | Decline invite |
| GET | `/home` | Partner | Partner dashboard home |
| GET | `/digest` | Partner | Member weekly digest |
| GET | `/academy/lessons` | Partner | Men's Academy lesson list |
| GET | `/academy/lessons/:slug` | Partner | Single lesson |
| POST | `/academy/lessons/:slug/complete` | Partner | Mark lesson complete |
| GET | `/content` | Partner | Partner-specific content |
| GET | `/activity` | Partner | Activity catalog |

---

## Admin Routes — `/api/admin`

All routes require `role: admin` or `role: developer`.

| Method | Path | Description |
|---|---|---|
| GET | `/users` | User list with filters |
| GET | `/users/:id` | Single user detail |
| PATCH | `/users/:id/plan` | Manually set plan |
| GET | `/ai` | AI flags list |
| GET | `/ai-flags/:id/reviews` | HITL review history for flag |
| PATCH | `/ai-flags/:id` | Resolve flag (admin triage) |
| POST | `/ai-flags/:id/retest` | Retest flag (writes HumanReview) |
| GET | `/evidence` | Evidence catalog |
| POST | `/evidence` | Submit new evidence record |
| PATCH | `/evidence/:id/status` | Update evidence status / sign-off |
| GET | `/analytics` | Product event counts (14d/30d) |
| GET | `/content` | CMS content pieces |
| POST | `/content` | Create content piece |
| PATCH | `/content/:id` | Update content piece |
| DELETE | `/content/:id` | Archive content piece |
| GET | `/billing` | Billing events |
| GET | `/partners` | Partner relationship list |
| GET | `/config` | App settings |
| PATCH | `/config` | Update app settings |

---

## Billing Routes — `/api/billing`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/checkout` | Member | Create Stripe checkout session |
| GET | `/portal` | Member | Open Stripe customer portal |
| POST | `/webhook` | Stripe sig | Stripe event handler (raw body) |

---

## Public Routes — `/api/public`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/evidence` | No | Public evidence catalog |
| GET | `/plans` | No | Plan pricing display |

---

## Error Format

```json
{
  "success": false,
  "message": "Human-readable error",
  "errors": { "field": ["error detail"] }
}
```

| HTTP Code | Meaning |
|---|---|
| 400 | Validation failed (Zod) |
| 401 | No token / expired token |
| 402 | Plan limit reached |
| 403 | Insufficient role or consent |
| 404 | Resource not found |
| 409 | Conflict (duplicate email) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
