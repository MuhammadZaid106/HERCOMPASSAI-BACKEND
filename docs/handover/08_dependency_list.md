# Dependency List — HerCompassAI

This document catalogs third-party libraries, frameworks, runtime requirements, and justification across the HerCompassAI codebase.

---

## 1. Runtime Environment
- **Node.js**: `v20.x` or `v22.x` LTS
- **Package Manager**: `pnpm@12.4.2` (managed via Corepack)
- **Database Engine**: PostgreSQL 16+ on Neon (Serverless with `pgvector` and SSL pooling)

---

## 2. Backend Dependencies (`backend/package.json`)

### Core Framework & Routing
| Package | Version | Purpose |
|---|---|---|
| `express` | `^5.2.1` | Minimalist web application framework for REST APIs. |
| `dotenv` | `^18.0.2` | Loads environment variables from `.env` files into `process.env`. |
| `cors` | `^2.8.6` | Configures Cross-Origin Resource Sharing for the Next.js frontend. |
| `morgan` | `^1.12.1` | HTTP request logger middleware for terminal and request auditing. |

### Database & ORM
| Package | Version | Purpose |
|---|---|---|
| `sequelize` | `^6.37.8` | TypeScript-compatible ORM for relational modeling and transactions. |
| `pg` | `^8.23.0` | Official PostgreSQL client for Node.js, providing SSL connection pooling. |
| `pg-hstore` | `^2.3.4` | Serializes and deserializes JSON/Hstore data for PostgreSQL. |

### Security & Authentication
| Package | Version | Purpose |
|---|---|---|
| `bcryptjs` | `^3.0.3` | Password hashing with 12 salt rounds (pure JS implementation). |
| `jsonwebtoken` | `^9.0.3` | HMAC SHA-256 JWT access and refresh token signing/verification. |
| `helmet` | `^8.3.0` | Secures HTTP headers (CSP, HSTS, X-Frame-Options). |
| `express-rate-limit` | `^8.7.0` | Rate limiting to prevent brute-force attacks and abuse. |
| `zod` | `^4.6.5` | TypeScript-first schema validation with static type inference. |
| `google-auth-library` | `^11.1.0` | Google OAuth token verification for social sign-in. |

### External Integrations
| Package | Version | Purpose |
|---|---|---|
| `stripe` | `^23.0.0` | Stripe API client for Checkout Sessions, Customer Portal, and Webhooks. |
| `nodemailer` | `^10.0.12` | SMTP transactional email client for account verification and password resets. |

### Development & Tooling
| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^7.0.2` | Static type checker and compiler. |
| `tsx` | `^4.23.15` | Native TypeScript execution engine for dev server and Node test runner. |

---

## 3. Frontend Dependencies (`frontend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `next` | `16.3.5` | React framework with App Router, SSR, and API route handling. |
| `react` / `react-dom` | `19.2.8` | UI component library. |
| `next-auth` | `^4.24.15` | Session management and authentication integration for Next.js. |
| `lucide-react` | `^1.47.0` | Modern, consistent icon library for Serene Orchid wellness aesthetic. |
| `recharts` | `^3.10.1` | Composable SVG charting library for symptom and energy trend visualizations. |
| `formik` & `yup` | `^2.4.9` / `^1.7.1` | Declarative form state management and client-side validation. |
| `tailwindcss` | `^4` | Utility-first CSS framework for responsive layout styling. |
