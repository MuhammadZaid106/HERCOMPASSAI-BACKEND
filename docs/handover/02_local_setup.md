# Local Setup Guide — HerCompassAI

> **Time to first working API:** ~10 minutes if Neon DB is already provisioned.

---

## Prerequisites

| Tool | Minimum Version | Check |
|---|---|---|
| Node.js | 20.x LTS | `node -v` |
| pnpm | 8.x | `pnpm -v` |
| Git | any | `git --version` |
| Neon account | — | [neon.tech](https://neon.tech) |

---

## 1 — Clone

```bash
git clone https://github.com/hercompassai-org/hercompassai.git
cd hercompassai
git checkout feature/for-main
```

---

## 2 — Backend setup

```bash
cd backend
pnpm install
```

### Create `.env`

Copy the example and fill in real values:

```bash
cp .env.example .env
```

Minimum required values:

```dotenv
# Neon PostgreSQL
DATABASE_URL=postgresql://user:pass@host.neon.tech/hercompassdb?sslmode=require

# JWT secrets (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<64-char-hex>

# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Stripe (test keys from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLUS_PRICE_ID_MONTHLY=price_...
STRIPE_PREMIUM_PRICE_ID_MONTHLY=price_...

# Email (optional — leave blank to log links in terminal)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM=HerCompassAI <your@gmail.com>

# Frontend URL (for invite links)
FRONTEND_URL=http://localhost:3000

# AI Providers (optional in dev — gateway falls back gracefully)
LLAMA_API_URL=https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct
LLAMA_API_KEY=hf_...
```

### Apply migrations

Run each SQL file in order against your Neon DB:

```bash
# Using psql (replace with your Neon connection string)
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# Or via Neon console: paste each migration file in sequence
```

Migration order:
```
001 → refresh_token_reuse_detection
002 → onboarding_profile_consent_and_additions
003/004 → member_library + personal_snapshots
005 → password_reset_tokens
006 → partner_invites
007 → saved_content
008 → entitlements_and_ai_tables
009 → snapshot_version_narrative
010 → user_stripe_billing_columns
011 → admin_six_slice
012 → email_action_tokens
013 → analytics_events
014 → user_funnel_stamps
015 → academy_schema_hardening (+ seeds categories & sources)
016 → database_rls (row-level security policies)
```

### Start backend dev server

```bash
pnpm run dev
# Server runs on http://localhost:5000
# Hot reload via tsx watch
```

Confirm it's working:
```bash
curl http://localhost:5000/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## 3 — Frontend setup

```bash
cd frontend
pnpm install
pnpm run dev
# App runs on http://localhost:3000
```

---

## 4 — Seed admin account

The admin account is seeded automatically on first startup (via `seedAdminDesk` called in `connectDB`). Check your terminal logs for:

```
[TIMESTAMP] [INFO] [SEED] Admin desk ready
```

Default admin credentials are set in your `.env` as:
```dotenv
SEED_ADMIN_EMAIL=admin@hercompassai.com
SEED_ADMIN_PASSWORD=<your-chosen-password>
```

If these env vars are not set, check `backend/src/services/admin/seedAdminDesk.ts` for the fallback.

---

## 5 — Verify end-to-end

```bash
# 1. Health
curl http://localhost:5000/health

# 2. Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test@12345"}'

# 3. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@12345"}'
# Copy accessToken from response

# 4. Profile
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

---

## 6 — Run tests

```bash
cd backend
npm test
# Expected: 238 tests pass, 0 fail
```

---

## Common issues

| Problem | Fix |
|---|---|
| `DATABASE_URL not set` | Copy `.env.example` → `.env` and fill `DATABASE_URL` |
| `SSL connection error` | Append `?sslmode=require` to your Neon URL |
| `JWT_SECRET must be at least 32 chars` | Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| Port 5000 already in use | Change `PORT=5001` in `.env` |
| CORS errors from frontend | Add frontend URL to `CORS_ORIGIN` in `.env` |
| Migrations fail | Check `DATABASE_URL` is the privileged Neon role (owner), not the app role |
