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
3. `migrations/auth/0001_auth.sql` — generated Better Auth identity
   schema, kept byte-for-byte as generated.
4. `migrations/auth/0002_phone_number_fields.sql` — app-owned extension for
   the Better Auth Phone Number plugin. It adds the unique phone-number field
   and verified flag without editing the generated migration.

Production and PGLite migrators explicitly include both auth and Fieldly
folders. Files are sorted by basename, so the production order is
`0001_auth.sql`, `0001_fieldly_core.sql`,
`0002_lock_down_browser_data_access.sql`, then
`0002_phone_number_fields.sql`. The Fieldly schema test separately checks
that its own tables can be applied without Supabase Auth tables.

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
2. Render's current networking documentation says Render services do not
   support IPv6. For this Render deployment, therefore, use the Supabase
   **shared pooler — session mode, port 5432** as the default connection.
3. Copy the session-pooler host and username from Supabase Connect; do not
   construct either value. Supabase documents this pooler as IPv4 reachable on
   every plan. The direct Supabase endpoint is IPv6 by default unless the
   project has the IPv4 add-on.
4. Avoid transaction pooler mode (port 6543) for the current persistent
   node-postgres pool and Better Auth adapter.
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

Configure these in the Render service's **Environment** settings:

- `DATABASE_URL` — Supabase PostgreSQL connection string.
- `NODE_ENV=production`.
- `VITE_AUTH_ENABLED=true` — available during the frontend build and runtime.
- `VITE_PHONE_OTP_ENABLED=true` — build-time UI flag for customer phone sign-in.
- `BETTER_AUTH_URL` — exact public origin, such as
  `https://makeservice.onrender.com`.
- `BETTER_AUTH_SECRET` — strong random value of at least 32 bytes.
- `MSG91_AUTH_KEY` — server-only MSG91 API auth key.
- `MSG91_FLOW_TEMPLATE_ID` — server-side ID of the approved transactional
  Flow template that sends the 6-digit code.
- `MSG91_OTP_VARIABLE=VAR1` — the placeholder variable in that Flow template.
  The adapter defaults to `VAR1` if this variable is omitted.
- `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`,
  `GROK_AUTH_CLIENT_SECRET` — optional app-specific OAuth broker credentials
  only when Google/X federated sign-in is also required. Phone OTP does not
  depend on the Grok OAuth broker.

Keep `MSG91_AUTH_KEY`, `BETTER_AUTH_SECRET`, and `DATABASE_URL` server-side;
only the two `VITE_*` feature flags are intentionally exposed to the frontend.
Production auth no longer falls back to shared preview OAuth credentials.

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

### Phone OTP status

The customer sign-in dialog and `/account` route now share the same Better Auth
Phone Number flow when production phone-OTP flags and server credentials are
configured. Local preview continues to use the visible fixed code `482609`;
that code is never accepted when `VITE_AUTH_ENABLED=true`.

- Better Auth generates and verifies the OTP; its user row stores the verified
  E.164 phone number.
- MSG91 delivers that Better Auth-generated code through its Flow API and an
  approved transactional/DLT template. It is not a second OTP verifier.
- The adapter expects a 6-digit code, 300-second expiry, and 3 failed
  verification attempts per code. Better Auth rate limiting also restricts
  phone OTP issuance to 3 requests/minute and verification to 5 requests/minute
  per client IP.
- After verification, the browser calls the authenticated server function to
  create the user's Fieldly profile/role. The browser cannot supply the
  account's owner ID.

#### MSG91 and DLT setup

1. Complete MSG91 account onboarding and configure your SMS channel.
2. Complete Indian DLT registration: Principal Entity, Sender ID/header and
   the exact transactional content template. Use MSG91's required DLT mapping
   and template approval workflow.
3. Create a MSG91 Flow template that matches the approved DLT content and has
   a placeholder for the OTP (default variable `VAR1`).
4. Copy the Flow template ID and place it with `MSG91_AUTH_KEY` in Render
   Environment settings. Keep both values secret. Set
   `VITE_PHONE_OTP_ENABLED=true` for the frontend build and
   `VITE_AUTH_ENABLED=true` for Better Auth.

Better Auth's rate limiter currently uses its default in-memory store. This
is adequate for the first single-instance staging test, but before scaling
Render to multiple instances we must move rate-limit storage to a shared
persistent store and add delivery-failure monitoring/alerts. The SMS callback
is intentionally fire-and-forget per Better Auth's timing guidance; a failed
MSG91 send is logged without the OTP or full phone number.

**Important:** The user now receives a real Better Auth session when the
configured OTP flow succeeds, but the rest of the marketplace store still
uses browser-local demo data. This does not yet enable real provider discovery,
booking, chat, GPS tracking or payments.

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
