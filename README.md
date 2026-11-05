# Fieldly — MakeService local-services marketplace

Fieldly is a responsive marketplace for discovering equipment and site services across India: borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers, and related work.

**Live preview:** https://makeservice.onrender.com/

## Current status: backend deployed; customer launch still gated

The production backend foundation was squash-merged into `main` through [PR #28](https://github.com/AkshithMuddagoni/makeservice/pull/28) on November 2, 2026, and deployed through the existing Render web service `makeservice`. The service still runs on Render Free for development and backend validation; a successful deploy is not customer-launch approval.

The live `makeservice` Supabase migration ledger was checked read-only on November 5, 2026 and is applied through `0018_booking_resource_assignment.sql`. [PR #35](https://github.com/AkshithMuddagoni/makeservice/pull/35) was merged on November 5, 2026 after its exact-head CI passed dependency audit, type-check, lint, automated tests, Playwright smoke tests and the production build. It adds migration `0019_index_booking_assigned_operator_asset_fk.sql`, supporting schema assertions and a CI lint step. The additive index is merged to `main`; the live database and Render rollout must be verified separately before considering it deployed. Render preview was skipped because the build runs database migrations and preview environments inherit the base service's environment variables.

The deployed backend connects authenticated Better Auth server sessions to PostgreSQL-backed accounts, provider onboarding, verified provider discovery, customer requests, provider quotes, booking lifecycle, participant chat, provider presence and short-lived GPS operations. Provider and operator review is server-authoritative and audit logged. The local preview path still contains fixed-code/browser-local demonstration behavior; it is not production identity or shared data.

The private `fieldly-private` Storage bucket is provisioned, private and limited to PDF/JPEG/PNG/WebP files up to 10 MiB. The server upload flow has owner-bound upload sessions, content-signature checks, fail-closed ClamAV scanning and administrator-only short-lived download links. However, `PROVIDER_DOCUMENT_UPLOADS_ENABLED` remains **false**, and secure uploads also require a configured private ClamAV scanner. Do not enable uploads until scanner health, expiry, deletion and retention behavior are tested. Secure identity/PAN verification still requires a specialist KYC provider.

Database-triggered **in-app** notifications and authenticated list/read functions are installed. The Supabase Cron cleanup job is registered and active daily at 02:17 UTC for expired notifications and live-location records. External transactional delivery (such as SMS/email/push) and delivery-failure alerting are still launch work.

All public application tables have RLS enabled; browser `anon` and `authenticated` roles have no application-table grants. Do not add broad RLS policies or expose the Supabase secret/service-role key.

**Not production-ready yet:** real phone OTP delivery (MSG91 + approved Indian DLT template), provider KYC, external transactional notification delivery, payment checkout/webhooks/refunds/reconciliation/vendor payouts, final environment/feature-flag verification, backup/restore drills, monitoring/alerting, external security review and live-device/load acceptance tests. No real payment is collected. Do not accept live work or payments until these gates are closed.

## Requirements

- Node.js 22
- npm
- VS Code (recommended)

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the terminal (normally `http://localhost:8080`). Local preview uses PGLite in-memory storage when `DATABASE_URL` is not configured. Its data resets when the dev server restarts.

## Build and checks

```bash
npm run build
npm run typecheck
npm test
npm run lint
```

A successful GitHub push or live Render URL is not, by itself, evidence that production workflows are safe.

## Backend migrations

The migration runner applies the uniquely named SQL files in basename order from
`migrations/auth/` and `migrations/fieldly/`:

1. `0001_auth.sql` — generated Better Auth identity/session schema.
2. `0001_fieldly_core.sql` — marketplace data model.
3. `0002_lock_down_browser_data_access.sql` — Fieldly RLS and browser-role lockdown.
4. `0002_phone_number_fields.sql` — verified phone-number fields.
5. `0003_rate_limit.sql` — database-backed Better Auth rate limits.
6. `0004_lock_down_auth_data_access.sql` — Better Auth browser-role lockdown.
7. `0005_provider_onboarding.sql` — provider business/service/asset/document requirements.
8. `0006_lock_down_migration_ledger.sql` — migration-ledger lockdown.
9. `0007_index_foreign_keys.sql` — indexes for operational foreign keys.
10. `0008_create_private_documents_bucket.sql` — non-public document bucket.
11. `0009_booking_start_code_issuance.sql` — service-start-code issuance cooldown.
12. `0010_booking_start_code_issue_limit.sql` — service-start-code issuance cap.
13. `0011_provider_document_upload_sessions.sql` — owner-bound private upload sessions.
14. `0012_provider_operator_roster.sql` — business-scoped operator-to-machine assignments.
15. `0013_index_provider_document_upload_session_foreign_keys.sql` — upload-session FK indexes.
16. `0014_index_provider_operator_asset_foreign_keys.sql` — composite operator/asset FK indexes.
17. `0015_booking_dispute_resolution.sql` — booking dispute workflow and resolution fields.
18. `0016_notifications_and_location_retention.sql` — durable in-app notifications, trigger-driven events and live-location retention cleanup.
19. `0017_index_bookings_dispute_resolved_by.sql` — supporting dispute-resolution index.
20. `0018_booking_resource_assignment.sql` — business-scoped operator/asset assignment constraints for bookings.
21. `0019_index_booking_assigned_operator_asset_fk.sql` — supporting composite index for the booking-to-operator/asset foreign key (**merged to `main` through PR #35; verify the production migration ledger after deployment**).

The live `makeservice` Supabase project was verified through migration
0018 on November 5, 2026. Migrations 0015–0018 are applied. Migration 0019 is
merged to `main`; it must appear in `public._migrations` and its index must be
visible in `public.bookings` after the controlled Render rollout.

**Production migration safety:** `npm run build` invokes `npm run db:migrate`,
which applies every pending SQL migration found in `migrations/auth/` and
`migrations/fieldly/` to the configured `DATABASE_URL`. Do not run
`npm run build` or `npm run db:migrate` against the production database from
an unmerged feature branch. Review CI, approve the PR, and use the controlled
production rollout; then verify both the `0019` ledger entry and the index in
`public.bookings`. If any migration proposes to re-run an earlier migration,
stop and inspect `public._migrations` before continuing.

`supabase/schema.sql` is retired. Do not apply it: its old `auth.uid()`
policies assume Supabase Auth UUIDs and are incompatible with Better Auth TEXT
identities. Use the ordered migrations above only.

## Backup and recovery

The `makeservice` Supabase organization was verified on November 5, 2026 as
**Free**. Free-plan projects do not receive automatic daily database backups.
Before customer-facing launch, choose one of these supported approaches:

- Upgrade the Supabase organization to a paid plan with automatic daily backups,
  then document backup retention, recovery objectives and a tested restore drill.
- While remaining on Free, schedule regular encrypted logical exports with the
  Supabase CLI `db dump` command and store them outside this repository and
  outside the Supabase project. Supabase recommends this for Free projects.

The Supabase CLI dump process requires Docker Desktop. The CLI's default dump
is schema-only; export roles and application data separately. Use the current
CLI reference for exact flags and confirm the outputs are non-empty before
considering a backup successful:

```powershell
supabase --version
supabase db dump --help

New-Item -ItemType Directory -Force .\backups | Out-Null
# Set SUPABASE_DB_URL temporarily in this PowerShell session from the
# Supabase Dashboard > Connect screen. Never paste it into chat or source.
supabase db dump --db-url "$env:SUPABASE_DB_URL" --role-only -f .\backups\roles.sql
supabase db dump --db-url "$env:SUPABASE_DB_URL" -f .\backups\schema.sql
supabase db dump --db-url "$env:SUPABASE_DB_URL" --data-only --use-copy -f .\backups\data.sql
Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue
Get-ChildItem .\backups
```

Add `backups/` to the local `.gitignore`; never commit database dumps. Encrypt
the exports before transferring them to independent storage and restrict access.
A database dump does **not** include the bytes stored in Supabase Storage. The
private `fieldly-private` bucket is currently empty, but any future KYC or
equipment documents need their own encrypted object backup and retention plan.

A backup is not considered validated until a restore has been performed against
an isolated non-production database and key checks pass: schema/migration
ledger, RLS enabled, browser-role grants denied, representative records and
private object access. Do not test restore commands against the live project.

## Render

The repository includes `render.yaml` for a Render Node web service (Node.js 22, `npm install && npm run build`, `npm run start`). The Blueprint and existing `makeservice` service remain on **Free** during development and backend validation. Upgrade to Starter only before customer-facing production, after persistent database/auth configuration and launch gates are ready. The Blueprint declares `DATABASE_URL` as a secret prompt, asks Render to generate `BETTER_AUTH_SECRET`, sets `BETTER_AUTH_URL` to the public app origin, and keeps auth/OTP/document-upload feature flags off by default. A custom domain can be added separately later.

For an **existing** Render service, do not assume Blueprint `sync: false` will prompt for a new value: Render only prompts for these variables during initial Blueprint creation. Add `DATABASE_URL` and `DATABASE_SSL_CA_BASE64` manually in the existing service's Dashboard > Environment before deploying this backend. Configure production secrets only in Render Environment settings; never put database URLs, passwords, OAuth secrets, payment credentials or private keys in frontend variables or GitHub.

### Supabase PostgreSQL TLS

The app data pool, Better Auth pool, and deploy-time migration runner all use `src/lib/postgres-ssl.mjs`. For Supabase PostgreSQL hosts, it requires the project's CA certificate and keeps Node TLS certificate/hostname verification enabled. The certificate is supplied through `DATABASE_SSL_CA_BASE64`: Base64 encoding of the PEM certificate downloaded from Supabase Dashboard > Database > Settings > SSL Configuration. Do not commit the certificate file or the encoded value to the repository.

On Windows, select the downloaded certificate in this PowerShell snippet. It copies only the CA certificate's Base64 text to your clipboard; paste that value into the Render Environment variable named `DATABASE_SSL_CA_BASE64` (not into chat or source code):

```powershell
Add-Type -AssemblyName System.Windows.Forms
$picker = New-Object System.Windows.Forms.OpenFileDialog
$picker.Title = "Select Supabase database CA certificate"
$picker.Filter = "Certificate files (*.crt;*.pem;*.cer)|*.crt;*.pem;*.cer"
if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Certificate selection cancelled."
}
$certificateBytes = [System.IO.File]::ReadAllBytes($picker.FileName)
$certificatePem = [System.Text.Encoding]::UTF8.GetString($certificateBytes)
if (-not $certificatePem.Contains("-----BEGIN CERTIFICATE-----")) {
    throw "Selected file is not a PEM certificate."
}
$caBase64 = [Convert]::ToBase64String($certificateBytes)
Set-Clipboard -Value $caBase64
Write-Host "Base64 CA certificate copied. Length: $($caBase64.Length) characters."
Remove-Variable certificateBytes, certificatePem, caBase64 -ErrorAction SilentlyContinue
```

Set `DATABASE_URL` to the Supabase **Session pooler** connection URI from the project's Connect panel (shared pooler, port `5432`, username format `postgres.<project-ref>`). Render's current service is IPv4-based; do not use the direct database host unless Render's outbound IPv6 connectivity has been independently verified. Keep the database password only inside the Render Environment value. Do not include a database URI or password in a commit, issue, or chat. The local direct and session-pooler tests succeeded with certificate verification enabled; Render connectivity still needs a post-configuration smoke test.


Do not switch `VITE_AUTH_ENABLED`, `VITE_PHONE_OTP_ENABLED` or `PROVIDER_DOCUMENT_UPLOADS_ENABLED` on until the corresponding MSG91/DLT, KYC and private-scanner gates have passed. The server deliberately fails closed in production if `DATABASE_URL` is missing; do not deploy the backend branch to the public service before the database and auth environment are provisioned.

## Authentication and data security

Better Auth is the intended identity source. Fieldly ownership columns use TEXT user IDs rather than Supabase Auth UUIDs. The generated Better Auth SQL remains untouched; the app-owned Fieldly SQL is independently testable and does not rely on Supabase Auth. Local preview still uses the fixed-code demo. Production phone sign-in is wired through Better Auth Phone Number and MSG91 Flow when the private MSG91 and Better Auth credentials are configured. The SMS template must be approved under Indian DLT requirements. Provider registration now has an authenticated database submission path, but that path requires a verified +91 phone session. Provider dashboard retrieval is backed by owner-scoped server reads for businesses, services, machinery and document-checklist status. An admin-only `/admin` review console supports submission triage, information requests, rejection and audited decisions; admin roles are granted manually through controlled database operations. Approval is blocked until required checklist entries and matching uploaded documents are verified. The authenticated production marketplace path now includes server-authoritative provider discovery, transactional customer requests, customer-owned request/quote reads, provider online presence and heartbeat, an owner-scoped request inbox, structured provider quotes, and customer quote acceptance that creates a confirmed booking with a terms snapshot. Booking lifecycle operations include provider status transitions, customer-issued HMAC-protected service-start codes, provider code verification, audited cancellation/dispute actions, short-lived provider GPS sharing, customer live-map refresh, and participant-only text booking chat. Providers can activate approved linked services/machines and view their own bookings. Start codes are limited to five issuances per booking, expire after five minutes, and allow ten verification attempts. Booking messages are limited to 2,000 characters and 12 messages per sender per booking per minute. Provider discovery requires approved business, service and machinery records plus recent online presence.

The database is accessed from the server through `src/lib/db.ts`. Supabase Data API roles `anon` and `authenticated` receive no access to Fieldly application tables; RLS is enabled without browser-facing policies. Client-facing operations must use authenticated server functions with verified session context and explicit customer/provider/admin ownership checks.

Private KYC/document bytes belong in a private Supabase Storage bucket. Store file metadata in PostgreSQL and use short-lived signed URLs after server-side ownership checks. Never store full PAN, Aadhaar, bank account numbers, IFSC, payment card data or raw OTPs in browser storage.

A database credential was previously committed in this repository's README, and an upstream preview OAuth credential was hard-coded in source. Treat exposed credentials as compromised: rotate/revoke them with the service owner, update any legitimate deployment using them, and review Git history. Removing a secret from the latest file does not remove it from older commits. Do not restore credentials to source files or commit a real `.env` file.

## Payment gateway evaluation

Cashfree Easy Split and Razorpay Route are both under evaluation. See [docs/payment-gateway-evaluation.md](docs/payment-gateway-evaluation.md). No gateway is selected or enabled. Any real checkout must use server-created orders, verified webhooks, idempotent ledger updates, reconciliation and audited vendor settlement.

## Technology stack

React 19, TanStack Start/Router, Vite, TypeScript, Tailwind CSS 4, Lucide, MapLibre GL, Zustand, Node.js, Render and Supabase PostgreSQL.

## Remaining production launch blockers

- Re-check the Render environment variable **names and safe-off flags** before launch: `DATABASE_URL`, `DATABASE_SSL_CA_BASE64`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NODE_ENV`, `VITE_AUTH_ENABLED`, `VITE_PHONE_OTP_ENABLED` and `PROVIDER_DOCUMENT_UPLOADS_ENABLED`. The operator previously confirmed the core database/auth variables during PR #28 deployment. Secret values are not stored in Git and were not read during this audit.
- Complete MSG91 account setup and Indian DLT Principal Entity, sender ID and transactional template approval; then test OTP send, verify, expiry, throttling, replay protection and delivery-failure alerts. Keep OTP activation deferred until this integration is complete.
- Integrate a specialist KYC provider for owner/PAN and other secure-only evidence. Do not collect full Aadhaar/PAN or bank details using the ordinary document picker.
- Deploy a private, monitored ClamAV service and implement/verify cleanup for expired upload sessions and orphaned storage objects. Keep `PROVIDER_DOCUMENT_UPLOADS_ENABLED=false` until clean/infected/timeout/signature-mismatch, signed-download, expiry, deletion and retention tests pass.
- Keep the installed database-triggered in-app notifications. Add and test external transactional delivery (SMS/email/push as selected), retries, dead-letter/failure visibility and operational alerts.
- Payments remain deferred. PR #19 is a Cashfree Easy Split **foundation only**; it does not provide checkout or real-money movement. Later work must add server-created checkout, verified signed webhooks, idempotent ledger changes, refunds, reconciliation, chargeback handling, provider KYC, commission and settlements. Do not enable payments or collect real money yet.
- Complete a backup/restore drill and document RPO/RTO; configure uptime/error/database alerts, credential rotation and Git-history review, production domain/TLS, rollback procedure, external security review, accessibility, real-device and load tests.
- Review open prototype work carefully before merge. PR #16 describes an older browser-localStorage prototype and is not the production backend. PR #34 operator linking remains gated on verified phone identity, so it must stay disabled until OTP is live. Do not merge prototype or OTP-dependent changes just to clear the PR list.

## Current production marketplace scope

The authenticated production marketplace path includes server-authoritative provider discovery, customer requests, owner-scoped request/quote reads, provider presence/heartbeat, assigned request inbox, structured quotes and atomic quote acceptance that creates a confirmed booking. Booking operations include provider status transitions, HMAC-protected customer service-start codes (five-minute expiry, five issues per booking, ten verification attempts), audited cancellation/dispute actions, short-lived provider GPS sharing with customer live-map refresh, provider booking history, and participant-only text chat. Chat is limited to 2,000 characters and 12 messages/minute per sender per booking. Provider service/machine activation is owner-checked and admin-approval-gated. The original local-storage marketplace remains preview-only; authenticated production operations use the server-backed flows.

