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

The canonical migration sequence is:

1. `migrations/auth/0001_auth.sql` — generated Better Auth identity/session schema, kept byte-for-byte.
2. `migrations/auth/0002_phone_number_fields.sql` — verified phone-number fields.
3. `migrations/auth/0003_rate_limit.sql` — PostgreSQL-backed Better Auth rate limits.
4. `migrations/auth/0004_lock_down_auth_data_access.sql` — Better Auth table-only RLS and browser-role lockdown.
5. `migrations/fieldly/0001_fieldly_core.sql` — Fieldly profiles, roles, provider businesses/services/assets/operators/documents, requests, quotes, bookings, messages, GPS, payment ledger, payout metadata and reviews.
6. `migrations/fieldly/0002_lock_down_browser_data_access.sql` — Fieldly table-only RLS and browser-role lockdown.
7. `migrations/fieldly/0005_provider_onboarding.sql` — provider business details, document-requirement checklist, and foreign keys from application ownership/reviewer fields to Better Auth users.

The production and PGLite migrators discover the auth folder first and Fieldly
folder second. Migration ledger entries use basenames, so keep every migration
basename unique across both folders. The complete migration test applies this
same ordered sequence and separately checks the Fieldly core migrations can run
without Better Auth tables.

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

A separate `makeservice-staging` project is recommended for isolated testing,
but it is **not technically required**. Your screenshot shows the existing
`makeservice` project labelled **PRODUCTION**. You can use that project if it
is dedicated to MakeService, has no unrelated application tables/data that
must be preserved, and you have reviewed the read-only inventory below.

The earlier five-table check confirmed only that those five named tables were
absent; it did not prove the entire public schema was empty. First run this
read-only query in the SQL Editor:

```sql
select schemaname, tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

Review the full list before choosing the existing production project. The
permission-lockdown migration has now been scoped to MakeService and Better
Auth tables only; it no longer revokes permissions across unrelated public
tables.

Preferred safe path: test on a separate staging project first, then migrate
production. Simpler path for a brand-new, dedicated MakeService database:
review the public-schema inventory, take/confirm an appropriate backup or
export, then run the migrations directly against this existing project from a
local PowerShell session. Do not run them until the inventory is reviewed.

For either path, keep the database credential in a local PowerShell session and
do not add it to the public Render service until authentication and migration
verification are complete.

1. In the chosen Supabase project's Dashboard, open **Connect** and copy a
   PostgreSQL connection string. Do not construct the pooler hostname or
   username manually.
2. Render does not support IPv6 addresses. For Render networking, use the
   Supabase **shared pooler — session mode, port 5432** as the safe default.
   Supabase documents this pooler as IPv4 reachable on every plan. The direct
   Supabase endpoint is IPv6 by default unless the project has its IPv4 add-on.
3. Copy the session-pooler host and username from Supabase Connect; do not
   construct either value. Avoid transaction pooler mode (port 6543) for the
   current persistent node-postgres pool and Better Auth adapter.
4. Keep TLS enabled (the Supabase connection string normally contains
   `sslmode=require`). URL-encode reserved characters in the database password
   if Supabase's copied connection string requires it.

Set `DATABASE_URL` only in the one PowerShell session used for the migration
or in an untracked local `.env`. Never prefix it with `VITE_`, expose it in
browser code or commit it. Never paste the connection string or password into
chat, GitHub issues, source files or screenshots.

#### Run migrations and normalize an earlier Windows ledger

The migration runner now normalizes Windows absolute paths from earlier runs
to canonical migration basenames before checking what is pending. It preserves
the original `applied_at` timestamps and does not execute those SQL files
again. This is important because Render runs Linux while local development may
run Windows.

Since an earlier Windows run may have recorded absolute paths, pull the latest
feature branch and run `npm run db:migrate` once more. Expected output is a
line similar to `[migrate] normalized 6 legacy migration ledger entries.`
followed by `[migrate] up to date.` It should **not** print any `applied`
lines. If it does print an `applied` line, stop and inspect the ledger before
continuing; do not deploy.

#### Run migrations from VS Code

After the chosen Supabase project is ready, open the MakeService repository
in VS Code and run this in the integrated PowerShell terminal:

```powershell
git fetch origin
git switch -c feat/production-backend-foundation --track origin/feat/production-backend-foundation
npm install

# Paste the staging project's Session pooler URI here, only in this terminal.
$env:DATABASE_URL = "postgresql://..."

npm run db:migrate

# Clear the credential from this PowerShell session immediately afterwards.
Remove-Item Env:DATABASE_URL
```

If the local branch already exists, use `git switch
feat/production-backend-foundation` instead of creating it again. Only use the current `makeservice` project after reviewing the full public
table inventory and confirming it is dedicated to MakeService.

A successful run should report six applied migrations:
`0001_auth.sql`, `0001_fieldly_core.sql`,
`0002_lock_down_browser_data_access.sql`,
`0002_phone_number_fields.sql`, `0003_rate_limit.sql`, and
`0004_lock_down_auth_data_access.sql`.
If the runner reports any SQL or connection error, stop and share only the
error text with credentials and hostnames removed. Do not retry against
production.

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

## Test Better Auth locally against the existing Supabase database

The Better Auth catch-all HTTP route is mounted at
`src/routes/api/auth/$.ts`. CI verifies that `GET /api/auth/get-session`
returns HTTP 200 with a null session when signed out, and that an invalid
session-cookie lookup also returns null. These checks do not create a user,
session, or OTP.

To run the same harmless session lookup against your Supabase PostgreSQL
database from Windows PowerShell:

1. Pull the latest `feat/production-backend-foundation` branch.
2. In a VS Code PowerShell terminal, set the following environment variables.
   Use your existing Supabase Session pooler URI for `DATABASE_URL`; never
   put it in source code or paste it into chat.

```powershell
$env:DATABASE_URL = "YOUR_SUPABASE_SESSION_POOLER_URI"
$env:VITE_AUTH_ENABLED = "true"
$env:VITE_PHONE_OTP_ENABLED = "false"
Remove-Item Env:BETTER_AUTH_URL -ErrorAction SilentlyContinue

npm run dev
```

3. Keep that terminal running. Open a second PowerShell terminal and call the
   session endpoint with a deliberately invalid cookie:

```powershell
$response = Invoke-WebRequest `
  -Uri "http://127.0.0.1:8080/api/auth/get-session" `
  -Method GET `
  -Headers @{
    Accept = "application/json"
    Cookie = "__Host-grok-auth.session_token=invalid-read-only-session-probe"
  }

"HTTP status: $($response.StatusCode)"
"Response body: $($response.Content)"
```

Expected: HTTP 200 and JSON `null`. A successful response proves the
Better Auth route can use its configured PostgreSQL adapter for a harmless
session lookup. No MSG91 credentials are needed and no SMS is sent. If the
server returns an error, stop and share the error text with credentials and
hostnames removed.

4. Stop the dev server with Ctrl+C. In the first terminal, clear the temporary
   variables:

```powershell
Remove-Item Env:DATABASE_URL
Remove-Item Env:VITE_AUTH_ENABLED
Remove-Item Env:VITE_PHONE_OTP_ENABLED
```

5. Confirm the probe created no identity/session records:

```sql
select
  (select count(*) from public."user") as auth_users,
  (select count(*) from public."session") as auth_sessions;
```

Both counts should remain unchanged (currently expected to be zero for this
new project).

This is a connection/session-read test only. It does not yet enable phone OTP;
that requires MSG91 Flow credentials, an approved Indian DLT template, and a
separate controlled SMS test.

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

### Provider onboarding database integration

The `/join` form now has two separate paths:

- Local preview continues to use the demo OTP and browser-local provider store.
- Production mode requires a Better Auth session with a verified +91 phone
  number. It calls `submitCurrentProviderApplication`; the owner ID and phone
  are derived server-side from the verified session, never accepted from the
  browser.

The server saves the business, selected services/tasks, machinery assets,
asset-to-service links, and document-requirement checklist in one PostgreSQL
transaction. It also adds the provider role to the authenticated account.
Duplicate legal-business submissions by the same owner are detected. New
businesses, services and assets start in **submitted / unapproved / unavailable**
state; nothing is automatically listed to customers.

The `provider_document_requirements` table stores only checklist metadata.
The browser file picker is not a document upload: production file selection is
blocked until private Supabase Storage uploads and server-signed URLs are
implemented. PAN, Aadhaar, bank details and actual KYC files are not stored by
this flow. Provider desk, review/admin approval, secure uploads and provider
discovery still require their own server-side wiring.

**Phone OTP is currently not enabled on your public site.** You deferred MSG91
and DLT setup, so this production path will reject provider submissions until
a Better Auth session with a verified Indian phone exists. The preview
`482609` code is never accepted by this database endpoint.



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
- Rate-limit counters are stored in the Supabase/PostgreSQL `rateLimit` table,
  not process memory. They survive Render restarts and are shared by app
  instances that use the same database.
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

Better Auth rate-limit counters now use database storage (the new
`migrations/auth/0003_rate_limit.sql` migration). The SMS callback is
intentionally fire-and-forget per Better Auth's timing guidance; a failed
MSG91 send is logged without the OTP or full phone number. Add delivery-failure
monitoring/alerts before broad public launch.

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
