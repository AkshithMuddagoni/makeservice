# Fieldly — MakeService local-services marketplace

Fieldly is a responsive marketplace for discovering equipment and site services across India: borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers, and related work.

**Live preview:** https://makeservice.onrender.com/

## Current status: backend integration PR open; production launch gated

The customer-facing main branch still serves the preview experience. The production backend work has been integrated into [PR #28](https://github.com/AkshithMuddagoni/makeservice/pull/28), on branch `feat/production-backend-rebased-20261101`, based on the current `main`. The PR is a draft and is **not merged or deployed**.

The PR branch connects authenticated Better Auth server sessions to PostgreSQL-backed account, provider onboarding, verified provider discovery, customer requests, provider quotes, booking lifecycle, participant chat, provider presence and short-lived GPS operations. Provider and operator review is server-authoritative and audit logged. In preview/local mode the original fixed OTP and browser-local state remain for visual testing; they are not production identity or shared data.

The private `fieldly-private` Storage bucket is provisioned and private. The server-side upload flow includes owner-bound upload sessions, file type/signature checks, fail-closed ClamAV scanning and administrator-only short-lived downloads, but `PROVIDER_DOCUMENT_UPLOADS_ENABLED` remains **false** until a private scanner and retention/deletion controls are deployed and tested. Secure identity/PAN verification still requires a specialist KYC provider.

The Supabase database is provisioned through migration 0014. All 30 public application tables have RLS enabled; browser `anon` and `authenticated` roles have no table grants. No public Storage access is configured. Do not add broad RLS policies or expose the service-role/secret key.

**Not production-ready yet:** real phone OTP delivery (MSG91 + approved Indian DLT template), provider KYC, transactional notifications, payment checkout/webhooks/refunds/reconciliation/vendor payouts, production Render environment variables, backup/restore, monitoring, external security review and live-device/load acceptance tests are not complete. No real payment is collected. Do not accept live work or payments until these gates are closed.

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

The live `makeservice` Supabase project has been verified through migration
0014. Migrations 0012–0014 are additive; 0013 and 0014 add supporting indexes.
After checking out the PR branch, `npm run db:migrate` should report no pending
migrations against that database. If it proposes to re-run an earlier migration,
stop and inspect `public._migrations` before continuing.

`supabase/schema.sql` is retired. Do not apply it: its old `auth.uid()`
policies assume Supabase Auth UUIDs and are incompatible with Better Auth TEXT
identities. Use the ordered migrations above only.

## Render

The repository includes `render.yaml` for a Render Node web service (Node.js 22, `npm install && npm run build`, `npm run start`). The Blueprint declares `DATABASE_URL` as a secret prompt, asks Render to generate `BETTER_AUTH_SECRET`, sets `BETTER_AUTH_URL` to the current public origin, and keeps auth/OTP/document-upload feature flags off by default.

For an **existing** Render service, do not assume Blueprint `sync: false` will prompt for a new value: Render only prompts for these variables during initial Blueprint creation. Add `DATABASE_URL` manually in the existing service's Dashboard > Environment before deploying this backend. Configure production secrets only in Render Environment settings; never put database URLs, passwords, OAuth secrets, payment credentials or private keys in frontend variables or GitHub.

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

- Configure Render with persistent PostgreSQL `DATABASE_URL`, a strong `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and production auth flags only after the approved sign-in method is ready. The checked-in `render.yaml` does not contain secrets or a database connection.
- Complete MSG91 account setup and Indian DLT Principal Entity, sender ID and transactional template approval; then test OTP send, verify, expiry, throttling and delivery-failure alerts.
- Integrate a specialist KYC provider for owner/PAN and other secure-only evidence. Do not collect full Aadhaar/PAN or bank details using the ordinary document picker.
- Deploy a private, monitored ClamAV service; keep document uploads disabled until clean/infected/timeout/signature-mismatch, signed-download, deletion and retention tests pass.
- Add transactional request/quote/booking notifications and delivery-failure monitoring.
- Select and contract an approved Indian marketplace payment/split provider. Implement server-created checkout, verified signed webhooks, idempotent ledger changes, refunds, reconciliation, chargeback handling, provider KYC, commission and settlements. No real payment is currently collected.
- Configure live alerting, backups and a successful restore drill, credential rotation, domain/TLS, rollback, external security review, accessibility, real-device and load tests.
- Merge and deploy PR #28 only after the exact-head CI passes and the required Render environment is provisioned. Keep the public site fail-closed until then.

## Current production marketplace scope

The authenticated production marketplace path includes server-authoritative provider discovery, customer requests, owner-scoped request/quote reads, provider presence/heartbeat, assigned request inbox, structured quotes and atomic quote acceptance that creates a confirmed booking. Booking operations include provider status transitions, HMAC-protected customer service-start codes (five-minute expiry, five issues per booking, ten verification attempts), audited cancellation/dispute actions, short-lived provider GPS sharing with customer live-map refresh, provider booking history, and participant-only text chat. Chat is limited to 2,000 characters and 12 messages/minute per sender per booking. Provider service/machine activation is owner-checked and admin-approval-gated. The original local-storage marketplace remains preview-only; authenticated production operations use the server-backed flows.

