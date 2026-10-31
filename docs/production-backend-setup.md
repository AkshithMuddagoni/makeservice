# MakeService backend foundation — setup guide

This guide describes the new database foundation. It does **not** mean the
current customer/provider UI has been switched from its browser preview store.

## Architecture decision

- Better Auth remains the existing identity system; Supabase Auth is not added.
- Supabase PostgreSQL is the intended production database.
- Render accesses PostgreSQL only from server code through
  `src/lib/db.ts` and the server-side `DATABASE_URL`.
- Better Auth uses TEXT IDs. Marketplace ownership columns also use TEXT IDs,
  but the Fieldly migrations do not require the Better Auth tables to exist in
  local preview mode.
- Fieldly tables have RLS enabled and no browser-facing policies. Supabase
  Data API roles `anon` and `authenticated` are denied table/sequence/function
  privileges. Customer/provider operations must go through authenticated
  server functions with resource-level ownership checks.
- Private files will use a private Supabase Storage bucket and short-lived
  signed upload/download URLs in a later milestone.

`supabase/schema.sql` is retired. Do not apply the old starter schema: its
`auth.uid()` policies assume Supabase Auth UUIDs and do not authorize Better
Auth users.

## Migration layout

App-owned SQL is intentionally separate from the opt-in Better Auth schema:

1. `migrations/fieldly/0001_fieldly_core.sql` — Fieldly profiles, roles,
   provider businesses/services/assets/operators/documents, requests, quotes,
   bookings, messages, GPS, payment ledger, payout metadata and reviews.
2. `migrations/fieldly/0002_lock_down_browser_data_access.sql` — revoke
   Supabase browser-role access and enable RLS for Fieldly tables.
3. `migrations/auth/0001_auth.sql` — generated Better Auth reference schema.
   This file is deliberately outside the automatic migration glob and must not
   be edited. The repository's existing auth-on convention copies it byte-for-
   byte to `migrations/0001_auth.sql` only when the app intentionally enables
   real Better Auth and provisions its identity credentials. The auth-off
   preview must not have that root-level copy.

When auth is enabled, the migration name ordering applies the root
`0001_auth.sql` before Fieldly's `0001_fieldly_core.sql`. When auth is not
enabled, Fieldly schema still applies locally without requiring an auth user
table.

## Local checks

```powershell
npm install
npm run typecheck
npm test
npm run build
```

The test suite includes a PGLite smoke test that applies the Fieldly migrations
without the Better Auth schema and checks that tables/RLS are created.

## Supabase migration setup

Do not connect Supabase to the public Render service until production
authentication is provisioned and credentials have been rotated.

For a controlled staging database:

1. In Supabase Dashboard, open **Connect** and copy a PostgreSQL connection
   string. Do not construct the pooler hostname or username manually.
2. Use the direct endpoint only if the Render runtime can reach its IPv6
   endpoint (or your project has IPv4 support).
3. For IPv4-only Render networking, use the Supabase shared pooler in
   **session mode, port 5432**. The pooler hostname and username differ from the
   direct connection; copy both from Supabase Connect.
4. Avoid transaction pooler mode for the current persistent node-postgres pool
   and Better Auth adapter.
5. Keep TLS enabled (the Supabase connection string normally contains
   `sslmode=require`).

Set `DATABASE_URL` only in Render Environment settings or an untracked local
`.env`. Never prefix it with `VITE_`, expose it in browser code or commit it.

After applying the migrations, verify in the Supabase SQL Editor:

```sql
select name, applied_at
from public._migrations
order by name;

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

## Render environment variables

Configure these in the Render service's **Environment** settings only after the
production identity broker is provisioned:

- `DATABASE_URL` — Supabase PostgreSQL connection string.
- `NODE_ENV=production`.
- `VITE_AUTH_ENABLED=true` — available during the frontend build and runtime.
- `BETTER_AUTH_URL` — exact public origin, such as
  `https://makeservice.onrender.com`.
- `BETTER_AUTH_SECRET` — strong random value of at least 32 bytes.
- `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`,
  `GROK_AUTH_CLIENT_SECRET` — app-specific identity-broker credentials.

Production auth no longer falls back to shared preview OAuth credentials. If
these credentials are not ready, do not point the public Render service at a
real customer database and do not accept bookings.

Local demo preview can continue with `VITE_AUTH_ENABLED=false` and no
`DATABASE_URL`; it uses PGLite/browser demo state and is not production
storage.

## Current authenticated account boundary

`src/lib/fieldly/account.functions.ts` exposes two server functions. They use
the existing `authMiddleware`, which verifies the request session and derives
the caller's user ID on the server. The browser cannot provide an arbitrary
user ID.

- `ensureCurrentFieldlyAccount` creates the current user's Fieldly profile
  and default customer role.
- `getCurrentFieldlyAccount` reads only that verified user's profile and roles.

This is a first integration slice, not the full production marketplace.
Provider onboarding, discovery, quote handling, bookings, job-state transitions,
documents, GPS, chat and payment operations still need authenticated server
functions and UI wiring.

## Sensitive data rules

- Do not store full PAN, Aadhaar, bank account numbers, IFSC, card data or raw
  OTPs in app tables or browser storage.
- Provider document rows store metadata and a private storage path only; file
  bytes belong in a private bucket.
- Store payment amounts as integer paise. Mark a payment captured only after a
  verified gateway webhook or a server-side status check.
- Persist only the minimum sanitized fields needed for webhook deduplication
  and reconciliation.
- Exact customer job-site coordinates and provider GPS locations are private.
- Live tracking rows expire and need a scheduled cleanup task.
