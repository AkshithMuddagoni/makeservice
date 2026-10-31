# MakeService backend foundation — setup guide

This guide describes the new production database foundation. It does **not**
mean the current UI has been switched from its browser preview store yet.

## Architecture decision

- Better Auth remains the identity provider.
- PostgreSQL on the existing Supabase project is the production database.
- The app accesses PostgreSQL only from Render/server code through
  `src/lib/db.ts` and `DATABASE_URL`.
- Better Auth IDs are TEXT values in the existing `"user"` table. The
  application does not use Supabase Auth's `auth.uid()` UUIDs.
- Marketplace tables have RLS enabled and no browser-role policies. Supabase
  Data API roles `anon` and `authenticated` are explicitly denied table
  access. Customer/provider access is implemented in authenticated server
  functions and scoped SQL.
- Private files will use a private Supabase Storage bucket and signed upload
  URLs in a later milestone.

Do not apply the retired `supabase/schema.sql`. It is retained only as a notice
to prevent accidentally applying the old Supabase-Auth-specific policies.

## Migrations

The canonical ordered schema is:

1. `migrations/0001_auth.sql` — Better Auth identity, sessions, accounts and
   verification table, plus optional phone-number columns.
2. `migrations/0002_fieldly_core.sql` — Fieldly profiles, roles, provider
   businesses/services/assets/operators/documents, job requests, quotes,
   bookings, messages, GPS, payment ledger and reviews.
3. `migrations/0003_lock_down_browser_data_access.sql` — revoke browser
   database privileges and enable RLS without public policies.

Run from the repository root:

```powershell
npm install
npm run db:migrate
```

The migration script requires `DATABASE_URL`. It tracks applied migrations in
`_migrations` and runs each SQL file transactionally. The normal production
build also runs `npm run db:migrate` after the Vite build.

After migration, verify in the Supabase SQL Editor:

```sql
select name, applied_at from public._migrations order by name;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and (tablename like 'fieldly_%'
    or tablename like 'provider_%'
    or tablename in ('job_requests', 'job_request_targets', 'bookings',
                     'booking_events', 'booking_messages',
                     'booking_live_locations', 'payment_intents',
                     'payment_webhook_events'))
order by tablename;
```

Every listed application table should report `rowsecurity = true`.

## Supabase connection string

In Supabase Dashboard, open **Connect** and copy a PostgreSQL connection
string. Do not invent the pooler hostname or username.

- Use the **direct connection** for a persistent Render service only when its
  outbound network can reach the project's IPv6 endpoint (or the project has
  the IPv4 add-on).
- Use the **shared pooler — session mode (port 5432)** when the Render
  environment is IPv4-only. The hostname and username are different; copy
  them from Supabase Connect.
- Do not use transaction mode (port 6543) with this app's current node-postgres
  pool / Better Auth persistent-session expectations.
- Ensure the connection string requires TLS (Supabase's Connect string
  normally includes `sslmode=require`).

Set it only in Render's Environment settings or a local untracked `.env`.
Never put it in Vite variables or browser code.

## Render environment variables

Configure these in the Render service's **Environment** settings. Values are
secrets or deployment-specific values and must be entered directly in Render:

- `DATABASE_URL` — Supabase PostgreSQL connection string.
- `NODE_ENV=production`.
- `VITE_AUTH_ENABLED=true` — must be set for the frontend build as well as
  runtime; never deploy a shared dev identity against the real database.
- `BETTER_AUTH_URL` — the exact public origin, for example
  `https://makeservice.onrender.com`.
- `BETTER_AUTH_SECRET` — a strong random secret (at least 32 bytes).
- `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` —
  production identity-broker values provisioned for this app. Do not reuse
  live-preview credentials in a public production deployment.

If production authentication has not been provisioned yet, do not set
`DATABASE_URL` on the public service and do not accept real bookings. The app
is deliberately fail-closed when a real database exists but authentication is
disabled.

Local preview may continue with `VITE_AUTH_ENABLED=false` and no
`DATABASE_URL`; it uses the existing local PGLite/demo environment. That mode
is not production data storage.

## First server-side account operation

`src/lib/fieldly/account.functions.ts` exports two server functions. Both use
`authMiddleware`; it verifies the Better Auth session and passes the trusted
user id to a dynamically imported server-only repository. The client cannot
supply an arbitrary user id.

- `ensureCurrentFieldlyAccount` creates the signed-in user's Fieldly profile
  and default customer role if they do not exist.
- `getCurrentFieldlyAccount` reads only that user's profile and roles.

Provider, admin, booking, document, GPS and payment operations are not yet
connected to UI routes. Those must be added as separate server functions with
role and resource ownership checks.

## Sensitive data rules

- Do not store full PAN, Aadhaar, bank account numbers, IFSC, card data or raw
  OTPs in app tables or browser storage.
- The provider document table stores metadata and a private storage path only.
- Store payment amounts as integer paise; mark payment captured only after a
  verified gateway webhook or server-side status check.
- Store only sanitized webhook fields in `payment_webhook_events.payload`.
- Exact customer job-site coordinates and live provider locations are private.
- Live tracking rows expire and must be deleted by a scheduled cleanup process.
