# Database Row-Level Security — HerCompassAI

**Status:** Implemented — Migration `016_database_rls.sql`  
**Feature:** F15 — Database RLS  
**Roles:** `hercompass_app` (runtime), `hercompass_migrations` (privileged)

---

## Why RLS?

JWT + Sequelize guards in application code are the first defence against
cross-user data access. RLS is the **second, independent defence**: even if
a bug omits a `WHERE user_id = ?` clause, Postgres itself refuses the read.

---

## How It Works

### Session variable

Every authenticated request sets a transaction-local variable before any query:

```sql
SET LOCAL app.current_user_id = '<uuid>';
```

All RLS policies compare `user_id::text` against
`current_setting('app.current_user_id', true)`.  
The `true` flag means the function returns `NULL` (not an error) when the
variable is not set — unauthenticated connections see nothing.

### Implementation point

This variable is set inside `authMiddleware.ts` immediately after the JWT
is verified, using a Sequelize query hook or raw query before any model
operation. The hook approach ensures the variable is always present for the
duration of the authenticated request.

> **Not yet implemented in middleware** — the migration creates the policies;
> wiring `SET LOCAL` into the Express middleware is the next step before
> enabling the `hercompass_app` restricted role in production.  
> For now the migration is applied and tested with the superuser role
> (which BYPASSRLS), so the existing app continues to work unchanged.

---

## Tables Covered

| Table | Policy | Scope |
|---|---|---|
| `users` | `users_self` | Own row only |
| `onboarding_profiles` | `onboarding_profiles_owner` | Own profile |
| `personal_snapshots` | `personal_snapshots_owner` | Own snapshots |
| `symptom_entries` | `symptom_entries_owner` | Own logs |
| `mood_entries` | `mood_entries_owner` | Own logs |
| `sleep_entries` | `sleep_entries_owner` | Own logs |
| `energy_entries` | `energy_entries_owner` | Own logs |
| `lifestyle_entries` | `lifestyle_entries_owner` | Own logs |
| `consents` | `consents_owner` | Own consent history |
| `goals` | `goals_owner` | Own goals |
| `entitlement_usages` | `entitlement_usages_owner` | Own quota rows |
| `email_action_tokens` | `email_action_tokens_owner` | Own tokens |
| `user_funnel_stamps` | `user_funnel_stamps_owner` | Own stamps |
| `saved_content` | `saved_content_owner` | Own bookmarks |
| `snapshot_versions` | `snapshot_versions_owner` | Own version history |
| `ai_audit_logs` | `ai_audit_logs_owner` | Own AI records |
| `ai_feedbacks` | `ai_feedbacks_owner` | Own feedback |
| `ai_flags` | `ai_flags_owner` | Own flags |
| `partner_relationships` | `partner_relationships_member` | Either side of relationship |
| `partner_consents` | `partner_consents_related` | Via relationship membership |
| `partner_permissions` | `partner_permissions_related` | Via relationship membership |
| `analytics_events` | `analytics_events_owner` | Own + anonymous events |

### Tables excluded from RLS (privileged background processes)

| Table | Reason |
|---|---|
| `refresh_tokens` | Token rotation requires cross-session reads |
| `password_reset_tokens` | Reset flow runs before auth is established |
| `billing_events` | Written by Stripe webhook (no user session) |
| `app_settings` | Global read-only config — no user scope |
| Admin tables (`ai_flag_cases`, `human_reviews`, etc.) | Admin-role only; separate GRANT is sufficient |

---

## Roles

### `hercompass_app` (runtime)

- Owns no tables (migration role creates them)
- Granted SELECT/INSERT/UPDATE/DELETE on public tables
- Subject to RLS — cannot read other users' rows
- Created manually before deploying to production:

```sql
CREATE ROLE hercompass_app LOGIN PASSWORD '<secret>';
```

### `hercompass_migrations` (privileged)

- Has BYPASSRLS (or is superuser in Neon)
- Used by the migration runner only
- `DATABASE_URL` for migrations must use this role
- Separate from the runtime `DATABASE_URL`

### Neon note

In Neon, the `neondb_owner` role is effectively superuser within the branch.
It BYPASSRLS by default, so the existing app connection continues to work
while RLS is enabled. When you promote to production:

1. Create `hercompass_app` role
2. Set `DATABASE_URL` for Express to the app role credentials
3. Apply `SET LOCAL app.current_user_id` in `authMiddleware.ts`
4. Confirm smoke test passes (see below)

---

## Smoke Test

After applying the migration and setting `SET LOCAL` in middleware:

```sql
-- 1. Open a psql session as the app role
SET LOCAL app.current_user_id = '00000000-0000-0000-0000-000000000001';

-- 2. User 1 data should be visible
SELECT id FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: 1 row

-- 3. User 2 data should be invisible
SELECT id FROM users WHERE id = '00000000-0000-0000-0000-000000000002';
-- Expected: 0 rows (RLS deny)

-- 4. Cross-user symptom leak test
SELECT id FROM symptom_entries LIMIT 5;
-- Expected: only rows belonging to user 1
```

---

## env.example additions

```dotenv
# Runtime role — restricted, subject to RLS (create before going to production)
DATABASE_URL=postgresql://hercompass_app:<password>@<neon-host>/hercompassdb?sslmode=require

# Migration role — BYPASSRLS, used by migration runner only
MIGRATION_DATABASE_URL=postgresql://hercompass_migrations:<password>@<neon-host>/hercompassdb?sslmode=require
```
