# Deployment Guide — HerCompassAI

This guide details how to deploy both the Backend (Express / Node.js) and Frontend (Next.js) environments for production, staging, and preview deployments.

---

## 1. Hosting Architecture Overview

- **Frontend**: Next.js App Router deployed on **Vercel** or container host.
- **Backend API**: Node.js / Express TypeScript service hosted on **Render**, **Railway**, or **Vercel Serverless / AWS ECS**.
- **Database**: **Neon Serverless PostgreSQL** (with `pgvector` extension for AI RAG embeddings and SSL connection pooling).
- **Email Service**: Resend / SendGrid / SMTP for transactional verification and password reset emails.
- **Stripe**: Stripe Webhooks and Checkout session routing.

---

## 2. Environment Variables Configuration

Ensure the following variables are securely set in your production secrets manager / hosting provider dashboard:

### Backend Production Environment (`backend/.env`)

```env
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://app.hercompassai.com

# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@ep-cool-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
DB_SSL=true

# JWT Secrets (Generate high entropy 64-character hex strings)
JWT_ACCESS_SECRET=your_super_secret_access_jwt_key
JWT_REFRESH_SECRET=your_super_secret_refresh_jwt_key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email Provider
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_your_api_key
EMAIL_FROM="HerCompassAI <noreply@hercompassai.com>"

# AI Gateway / LLM
OPENAI_API_KEY=sk-proj-...
AI_GATEWAY_PROVIDER=openai

# Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CORE_MONTHLY=price_...
STRIPE_PRICE_COUPLE_MONTHLY=price_...
STRIPE_PRICE_CORE_ANNUAL=price_...
STRIPE_PRICE_COUPLE_ANNUAL=price_...
```

### Frontend Production Environment (`frontend/.env.production`)

```env
NEXT_PUBLIC_API_URL=https://api.hercompassai.com
NEXTAUTH_URL=https://app.hercompassai.com
NEXTAUTH_SECRET=your_nextauth_session_secret
```

---

## 3. Database Migration Deployment (Neon PostgreSQL)

Before launching new backend revisions, execute pending migrations:

```bash
cd backend
npm run db:migrate
# Or if executing raw SQL migrations:
# pnpm run migrate:up
```

Verify that Row Level Security (RLS) is applied:
```sql
\i migrations/016_database_rls.sql
```

---

## 4. Deploying Backend

### Railway / Render
1. Connect GitHub repository `hercompassai-org/hercompassai`.
2. Set Root Directory to `backend`.
3. Set Build Command: `pnpm install && pnpm build` (or `npm install && npm run build`).
4. Set Start Command: `node dist/app.js` or `pnpm start`.
5. Attach the Environment Variables listed in Section 2.
6. Configure health check endpoint: `GET /api/health`.

---

## 5. Deploying Frontend (Vercel)

1. Connect repository to Vercel.
2. Set Root Directory to `frontend`.
3. Framework Preset: `Next.js`.
4. Build Command: `pnpm build`.
5. Set `NEXT_PUBLIC_API_URL` to the production backend URL.
6. Deploy and map primary domain (`app.hercompassai.com`).

---

## 6. Post-Deployment Verification Checklist

1. `GET https://api.hercompassai.com/api/health` returns `200 OK` and `{ status: "healthy", timestamp: ... }`.
2. Check DB connectivity in logs.
3. Test User Registration and Email Verification link flow.
4. Test Stripe Webhook endpoint using `stripe listen --forward-to` or live test webhooks.
5. Verify SSL certificates are active on both frontend and backend domains.
