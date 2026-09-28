# Sessions and Google sign-in

Covers `POST /api/auth/refresh` and `POST /api/auth/google`. These two endpoints
changed behaviour; see [Migration](#migration-required) before deploying.

## Refresh token reuse detection

Refresh tokens are stored as a SHA-256 digest, never in plaintext. Every refresh
**rotates**: the presented token is revoked and a new pair is issued inside one
transaction with a row lock, so two concurrent refreshes cannot both succeed.

Rotation alone is not enough. If a token is stolen, the attacker and the real user
will both present it; whichever is second is using a dead token, which is the
signal that something went wrong. Previously that case just returned `401` and
left the attacker's still-live token working.

Now every token belongs to a **family** — one lineage per login:

| Column          | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `family_id`     | Groups every token descended from one login                     |
| `replaced_by_hash` | Digest of the token that replaced it during rotation         |

`classifyRefreshAttempt` in `src/services/auth/refreshTokenPolicy.ts` decides:

| Stored state                          | Verdict           | Effect                                  |
| ------------------------------------- | ----------------- | --------------------------------------- |
| No row                                | `unknown`         | `401`                                   |
| Past `expires_at`                     | `expired`         | `401`                                   |
| `revoked`, no `replaced_by_hash`      | `revoked`         | `401` — clean logout, session untouched  |
| `revoked`, with `replaced_by_hash`    | `reuse_detected`  | **Revoke the whole family**, then `401`  |
| Live and unrevoked                    | `valid`           | Rotate and issue a new pair              |

Two deliberate choices:

- **Expiry is checked before revocation.** A leaked token that has already expired
  cannot hurt anyone, and treating its replay as theft would let anyone who once
  held an old token log the victim out permanently. Only a replay inside the
  validity window counts as theft.
- **Logout revokes one token, not the family**, and deliberately leaves
  `replaced_by_hash` null. That keeps a later replay of a logged-out token a plain
  `revoked` verdict instead of a family wipe, so a copied old token cannot be used
  as a logout bomb.

The decision is a pure function, so the rule is unit-tested without a database in
`tests/auth/sessionSecurity.test.ts`.

## Google sign-in

`POST /api/auth/google` takes **only** an ID token:

```json
{ "idToken": "<the credential from Google Identity Services>" }
```

The server calls `verifyIdToken` and trusts the verified claims alone — `sub`,
`email`, `name`, `email_verified`, `iss`. It then:

- requires `email_verified === true`, so an unverified Google address can never
  claim an account;
- requires the issuer to be `accounts.google.com`;
- creates new users as `role: "member"`, `plan: "free"` — server-owned, never
  taken from the request;
- links to an existing account only when the verified email matches;
- returns `409` if the email is already bound to a different Google subject;
- returns `503` when `GOOGLE_CLIENT_ID` is unset, so deployments without Google
  sign-in still boot.

The previous implementation read `email`, `googleId`, `role` and `plan` from the
request body and never verified a token. That let anyone who knew an email address
sign in as that user, and let the caller rewrite an existing account's `role` and
flip `emailVerified` to `true`. Fixed, not deprecated.

Set the client ID in Google Cloud Console → APIs & Services → Credentials:

```env
GOOGLE_CLIENT_ID=<your OAuth 2.0 client id>
```

`registerSchema` and `googleAuthSchema` both restrict `role` to
`member | partner`, so a browser cannot self-assign `admin` or `developer` on any
sign-in path.

## Migration (required)

The app boots with `sequelize.sync({ alter: false })`, which never adds columns to
an existing table. Run this once against the same database as `DATABASE_URL`
before deploying, or refresh will fail on the missing columns:

```bash
psql "$DATABASE_URL" -f migrations/001_refresh_token_reuse_detection.sql
```

It is idempotent (`IF NOT EXISTS`) and backfills `family_id` with each row's own
id, so historical tokens gain reuse protection without being grouped together.

The same file documents the periodic purge for dead rows:

```sql
DELETE FROM refresh_tokens
 WHERE revoked = true
   AND expires_at < NOW() - INTERVAL '30 days';
```

Only expired **and** revoked rows are removable, so a live session can never be
deleted out from under itself.

## Also changed

- `/api/auth/refresh`, `/api/auth/logout` and `/api/auth/google` are now behind
  `authRateLimiter`, alongside `/register` and `/login`.
- The refresh token lifetime is read from `JWT_REFRESH_EXPIRES_IN` in all three
  issuance paths. It used to be hard-coded to 7 days in the controller while the
  JWT honoured the env var, so changing the env var produced a token the database
  rejected.
- Access tokens are stateless and cannot be revoked before they expire (15m by
  default). Logout only revokes the refresh token. If you need immediate access
  -token revocation, that requires a denylist or short-lived tokens plus a
  refresh on every request.
