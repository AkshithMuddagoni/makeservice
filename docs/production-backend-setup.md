# MakeService backend foundation — setup guide

This guide describes the backend implementation on the draft integration branch
`feat/production-backend-rebased-20261101` and the verified Supabase schema.
The branch is proposed in [PR #28](https://github.com/AkshithMuddagoni/makeservice/pull/28);
it is **not yet merged into main or deployed to Render**. The main-branch public
site remains on its preview experience until the PR is reviewed, merged and the
production environment is provisioned.

## Architecture decision

Production server startup now fails closed when `NODE_ENV=production` and `DATABASE_URL` is missing or blank. PGlite is reserved for local development and preview; a public production service must use persistent PostgreSQL.

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
- Provider-document upload and administrator-only signed downloads are
  implemented on the branch using a private Supabase Storage bucket, but remain
  feature-gated off until ClamAV, retention/deletion controls and end-to-end
  security tests are complete.
- Payment tables are a ledger foundation only. There is no gateway checkout,
  webhook processing or provider settlement integration yet.

`supabase/schema.sql` is retired. Do not apply the old starter schema: its
`auth.uid()` policies assume Supabase Auth UUIDs and do not authorize Better
Auth users.

## Better Auth 1.7 security update

The integration branch upgrades Better Auth from the 1.6 line to **1.7.15**
and pins the transitive `seroval` package to **1.6.11**. Better Auth 1.7.7
or later fixes the PostgreSQL database-backed rate-limit race condition
(GHSA-44jh-23m7-hpcf) and the OAuth-state/Magic-Link token-confusion issue
(GHSA-965c-763c-88jm). MakeService does not register the Magic Link plugin,
but the fixed version removes the vulnerable code path from the installed
Better Auth package. Seroval 1.6.11 fixes the typed-array constructor
serialization issue (GHSA-f86p-h4j2-7qgj); it also includes the prior RegExp
serialization fix.

The Generic OAuth API changed in Better Auth 1.7. The application has been
updated accordingly:

- Browser sign-in now calls `authClient.signIn.social({ provider })`; the
  obsolete `genericOAuthClient()` plugin is removed.
- The first-party preview popup uses `auth.api.signInSocial()` and asks for
  the authorization URL without an automatic redirect.
- Generic OAuth callbacks now use
  `/api/auth/callback/:providerId`, not
  `/api/auth/oauth2/callback/:providerId`.

Before enabling app-specific Google/X OAuth on a deployed origin, update the
shared auth-broker client's allowed redirect URIs to:

- `https://makeservice.onrender.com/api/auth/callback/grok-google`
- `https://makeservice.onrender.com/api/auth/callback/grok-x`

Do not delete old broker redirect entries until the corresponding running
application has been migrated. This callback change is a configuration task
for the auth-broker owner; it is not performed by the Render Blueprint.

The direct upgrade from 1.6.33 to 1.7.15 does not require a Better Auth
account-table migration: the 1.7.3+ schema is unchanged from 1.6. Confirm the
existing `public.account` table has no experimental `issuer` column before
deploying; if it exists from a temporary 1.7.0–1.7.2 upgrade, stop and review
the official Better Auth 1.7 migration guide first.

Sources:
- Better Auth 1.7 upgrade guide:
  https://better-auth.com/docs/guides/1-7-upgrade-guide
- PostgreSQL rate-limit advisory:
  https://github.com/advisories/GHSA-44jh-23m7-hpcf
- OAuth-state/Magic-Link advisory:
  https://github.com/advisories/GHSA-965c-763c-88jm
- Seroval typed-array advisory:
  https://github.com/advisories/GHSA-f86p-h4j2-7qgj

After npm updates the local lockfile, verify with `npm ls better-auth
@better-auth/core @better-auth/kysely-adapter @better-auth/drizzle-adapter
seroval`, `npm audit --omit=dev`, typecheck, unit tests, Playwright and a
production build. Do not deploy until all checks pass.

## Migration layout

The migrator discovers the auth and Fieldly folders, then applies the uniquely
named SQL files in basename order:

1. `migrations/auth/0001_auth.sql` — generated Better Auth identity/session schema.
2. `migrations/fieldly/0001_fieldly_core.sql` — marketplace profiles, provider, request, quote, booking, message, GPS and payment-ledger tables.
3. `migrations/fieldly/0002_lock_down_browser_data_access.sql` — Fieldly RLS and browser-role lockdown.
4. `migrations/auth/0002_phone_number_fields.sql` — verified phone fields.
5. `migrations/auth/0003_rate_limit.sql` — persistent Better Auth rate limits.
6. `migrations/auth/0004_lock_down_auth_data_access.sql` — Better Auth browser-role lockdown.
7. `migrations/fieldly/0005_provider_onboarding.sql` — business details, evidence checklist and ownership foreign keys.
8. `migrations/fieldly/0006_lock_down_migration_ledger.sql` — migration-ledger lockdown.
9. `migrations/fieldly/0007_index_foreign_keys.sql` — operational foreign-key indexes.
10. `migrations/fieldly/0008_create_private_documents_bucket.sql` — private, non-public document bucket.
11. `migrations/fieldly/0009_booking_start_code_issuance.sql` — service-start-code cooldown metadata.
12. `migrations/fieldly/0010_booking_start_code_issue_limit.sql` — cap service-start-code issuance.
13. `migrations/fieldly/0011_provider_document_upload_sessions.sql` — owner-bound one-time upload sessions.
14. `migrations/fieldly/0012_provider_operator_roster.sql` — operator-to-machine assignments with composite ownership foreign keys.
15. `migrations/fieldly/0013_index_provider_document_upload_session_foreign_keys.sql` — upload-session foreign-key indexes.
16. `migrations/fieldly/0014_index_provider_operator_asset_foreign_keys.sql` — composite operator/asset foreign-key indexes.

The live `makeservice` Supabase database has been verified through migration
0014. Migrations 0012–0014 were applied and recorded in `public._migrations`.
The upload-session and operator/asset foreign-key warnings have been resolved.
All 30 public tables currently have RLS enabled; the `anon` and
`authenticated` roles have no application-table grants. Do not add broad
browser-facing policies: application access is intended to go through
authenticated server functions with explicit ownership and role checks.

`supabase/schema.sql` is retired. Do not apply it; its historical
`auth.uid()` policies assume Supabase Auth UUIDs, whereas this application
uses Better Auth TEXT identities.

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

#### Current migration state

The live `makeservice` project has already been advanced through migration
0014 and its ledger entries have been verified. Do not re-run migration SQL
manually or paste credentials into chat. After checking out the integration
branch, run `npm run db:migrate` only when using the intended database
connection; the expected result for the already-updated live project is
**no pending migrations**.

#### Check out and validate the integration branch

```powershell
git fetch origin
git switch --track origin/feat/production-backend-rebased-20261101
npm install
npm run typecheck
npm test
npm run build
```

If the branch already exists locally, use
`git switch feat/production-backend-rebased-20261101` instead of creating it
again. Keep `DATABASE_URL` in an untracked local PowerShell session or secret
manager only. Never paste it into chat, source files or screenshots.

The expected migration ledger contains sixteen canonical files:
`0001_auth.sql`, `0001_fieldly_core.sql`,
`0002_lock_down_browser_data_access.sql`, `0002_phone_number_fields.sql`,
`0003_rate_limit.sql`, `0004_lock_down_auth_data_access.sql`,
`0005_provider_onboarding.sql`, `0006_lock_down_migration_ledger.sql`,
`0007_index_foreign_keys.sql`, `0008_create_private_documents_bucket.sql`,
`0009_booking_start_code_issuance.sql`, `0010_booking_start_code_issue_limit.sql`,
`0011_provider_document_upload_sessions.sql`, `0012_provider_operator_roster.sql`,
`0013_index_provider_document_upload_session_foreign_keys.sql`, and
`0014_index_provider_operator_asset_foreign_keys.sql`.

If `npm run db:migrate` proposes to re-run an older file, stop and inspect
`public._migrations`; do not proceed with deployment. If it reports a
connection or SQL error, preserve the error but remove database hostnames and
credentials before sharing it.

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

1. Pull the latest `feat/production-backend-rebased-20261101` branch.
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

The checked-in `render.yaml` keeps the web service on the **Free** plan
during development and backend validation. The existing live `makeservice`
service is also Free and continues tracking `main`; this PR branch is not
deployed to it.

Before a customer-facing production launch, upgrade the existing service in
the Render Dashboard → Settings → General → Instance Type to **Starter**,
after the persistent database/auth environment and all launch gates are ready.
The upgrade is deliberately deferred; no paid plan change is being made now.
A custom domain can be configured separately at launch and does not need to be
purchased or connected during this development phase.

The Blueprint declares the baseline variables for new Blueprint-created
services:

- `DATABASE_URL` is `sync: false`, so the database URL is never committed.
- `BETTER_AUTH_SECRET` is generated by Render for a new service.
- `BETTER_AUTH_URL` is set to the public app origin.
- `VITE_AUTH_ENABLED=false`, `VITE_PHONE_OTP_ENABLED=false` and
  `PROVIDER_DOCUMENT_UPLOADS_ENABLED=false` keep user-facing production
  operations closed until their dependencies are verified.

**Existing Render service warning:** Render only prompts for `sync: false`
values during the initial Blueprint creation. When updating an existing service,
the Blueprint sync ignores new `sync: false` values; add `DATABASE_URL`
manually in Dashboard → Environment and verify the generated/auth secret there
before deploying. The production server exits rather than falling back to
ephemeral PGLite if `DATABASE_URL` is missing.

Configure these only as the corresponding production integrations are ready:

- `DATABASE_URL` — Supabase PostgreSQL Session pooler connection string
  (server-only, TLS enabled).
- `NODE_ENV=production`.
- `VITE_AUTH_ENABLED=true` — only after a real sign-in method is configured.
- `VITE_PHONE_OTP_ENABLED=true` — only after MSG91 and Indian DLT template
  approval and the controlled OTP tests pass.
- `BETTER_AUTH_URL` — exact public origin, e.g.
  `https://makeservice.onrender.com`.
- `BETTER_AUTH_SECRET` — strong generated random value of at least 32 bytes.
- `MSG91_AUTH_KEY` — server-only MSG91 API auth key.
- `MSG91_FLOW_TEMPLATE_ID` — server-side ID of the approved transactional
  Flow template that sends the 6-digit code.
- `MSG91_OTP_VARIABLE=VAR1` — the placeholder variable in that Flow template.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` — server-only Storage access;
  never expose the secret key to Vite.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — public key used only by the browser for
  requests to a server-issued signed upload URL.
- `CLAMAV_HOST` and optional `CLAMAV_PORT=3310` — private network address of
  the ClamAV daemon; do not expose it publicly.
- `PROVIDER_DOCUMENT_UPLOADS_ENABLED=true` — only after the private scanner,
  KYC workflow, signed upload/download, malware and retention tests pass.
- `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET`
  — optional app-specific OAuth broker credentials when Google/X sign-in is
  also required. Phone OTP does not depend on the Grok OAuth broker.

Keep `MSG91_AUTH_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL` and
`SUPABASE_SECRET_KEY` server-side. Only `VITE_AUTH_ENABLED`,
`VITE_PHONE_OTP_ENABLED` and `VITE_SUPABASE_PUBLISHABLE_KEY` are intentionally
exposed to the frontend. Never prefix database, Storage, MSG91 or ClamAV
credentials with `VITE_`. Production auth does not fall back to shared preview
OAuth credentials.

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
The production `/desk` route now reads provider businesses, services, machines,
document-checklist status and payout-onboarding status through an authenticated
server function. Every business query is scoped to the Better Auth user ID
from `authMiddleware`; child rows are fetched only for those owned business
IDs. The dashboard does not return storage paths, full identity values or bank
details, and it does not allow the owner to approve themselves or mark a
listing available.

The provider onboarding form now has a post-submission private document upload
step. The server issues a one-time Storage upload URL, binds it to the owner and
checklist requirement, then checks the actual file signature, exact byte size
and a ClamAV scan before recording document metadata. Uploads remain disabled
until the Render feature flag, server-side Supabase Storage key and private
ClamAV service are configured. Secure identity/PAN verification through a
specialist KYC provider is still outstanding; never collect full Aadhaar, PAN
or bank numbers in the normal browser form. Provider discovery, requests,
quotes, booking lifecycle, GPS and booking chat have server functions; real
notifications, payments and payouts remain launch blockers.

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

**Important:** The branch now routes authenticated production discovery,
requests, provider quotes, booking lifecycle, chat and GPS through server-side
functions. These changes are still on draft PR #28 and are not live on the
public main-branch deployment. Real checkout, notifications, secure KYC and
provider payout/settlement are not implemented.

## Administrator role provisioning and provider review

The `/admin` console and all admin server functions require the
`admin` row in `public.fieldly_user_roles`. The app has no customer/provider
function that can grant this role, and the admin page cannot grant access to
itself.

Bootstrap an administrator only after the intended person has completed a
real Better Auth sign-in and their Indian mobile number is verified. In
Supabase SQL Editor, first identify the intended account:

```sql
SELECT id, name, "phoneNumber", "phoneNumberVerified"
FROM public."user"
WHERE "phoneNumberVerified" = true
ORDER BY "createdAt" DESC;
```

After independently confirming the exact user ID with the account owner,
grant the role explicitly:

```sql
INSERT INTO public.fieldly_user_roles (user_id, role)
VALUES ('<CONFIRMED_BETTER_AUTH_USER_ID>', 'admin'::fieldly_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

To revoke administrator access:

```sql
DELETE FROM public.fieldly_user_roles
WHERE user_id = '<CONFIRMED_BETTER_AUTH_USER_ID>'
  AND role = 'admin'::fieldly_role;
```

Treat the admin role as privileged production access. Use individual accounts,
enable strong authentication, grant the minimum number of admin accounts, and
keep role-grant/revoke SQL under change control. The `fieldly_admin_audit`
table records every successful provider review decision.

The admin review queue supports `submitted`, `under_review`, and
`needs_information` applications. Reviewers can start/resume review, request
information, or reject with a reason. Admins can open an uploaded document
through a five-minute, forced-download URL, then verify or reject it with an
audit-logged decision. Approval remains blocked unless every required
checklist row is `verified` and a matching `provider_documents` row is also
`verified`. Required secure-only identity/PAN steps cannot yet pass because
the specialist KYC integration is not configured. Storage paths never reach
the browser; download URLs are issued only after the server checks the admin role.

Migration 0011 adds the server-only upload-session table. The role, audit table,
foreign keys, RLS, private bucket and upload-session schema are in the current
sixteen-migration deployment sequence.
## Private provider-document bucket

Migration 0008 provisions `fieldly-private` as a non-public bucket with a 10 MiB file-size limit and an allowlist of PDF, JPEG, PNG and WebP. Migration 0011 adds server-only upload sessions that bind a signed upload to the provider owner and its specific document requirement. No browser Storage policies are created. Uploads are feature-gated by `PROVIDER_DOCUMENT_UPLOADS_ENABLED=true` and require a healthy private ClamAV scanner configured with `CLAMAV_HOST` (and optional `CLAMAV_PORT`). The server creates a one-time signed upload URL, then verifies the owner-bound upload session, size, file magic and ClamAV result before creating the document record. Administrator viewing uses a five-minute forced-download URL; only an administrator session can request it. Failed, mismatched or infected files are rejected and deletion is attempted. The scanner must be on a private network and health-monitored. A separate retention/deletion job, scan-evasion testing and external security audit are still required.

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
