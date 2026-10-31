# Fieldly — MakeService local-services marketplace

Fieldly is a responsive marketplace for discovering equipment and site services across India: borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers, and related work.

**Live preview:** https://makeservice.onrender.com/

## Current status: prototype UI + production backend foundation in progress

The existing customer/provider screens remain a prototype. The main Fieldly marketplace store in `src/lib/fieldly/store.ts` still persists sessions, provider changes, requests, quotes, bookings, messages, and reviews in browser `localStorage`. That is per-browser demo state, not a shared marketplace database.

Local preview still uses the fixed code 482609. When production Better Auth and MSG91 settings are configured, the customer dialog uses server-verified phone OTP instead. Provider records, ratings, prices, reviews, and verification flags still include seeded demo data. Provider `/join` submissions now have an authenticated database path, but it requires a verified Indian Better Auth phone session; MSG91/DLT has not yet been configured. The provider desk/review approvals, discovery, bookings, chat, GPS, KYC file uploads and payments still contain preview/local-state paths. Do not accept real work or payments through those remaining prototype workflows.

A new branch, `feat/production-backend-foundation`, contains the first backend foundation:
- Ordered Better Auth + Fieldly PostgreSQL migrations.
- Better Auth TEXT user IDs (not Supabase Auth UUIDs).
- Core marketplace schema for businesses, provider services, assets, documents, job requests, quotes, bookings, messages, location, payments and reviews.
- Browser-role database lockdown and RLS enablement.
- Authenticated server functions for creating/reading the current Fieldly account and storing customer display names.
- Better Auth Phone Number plugin with optional MSG91 Flow/DLT delivery and PostgreSQL-backed rate limiting.
- Authenticated provider registration writes business, service, machine, asset links and document checklist in one transaction, scoped to the verified Better Auth user.
- Sign-out clears the Better Auth server session before clearing the legacy local UI identity.
- Supabase/Render setup and payment gateway evaluation documents.

The UI has **not** yet been switched to these server functions and the branch has not been deployed. Do not treat this milestone as production launch approval.

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

The ordered schema is in `migrations/auth/*.sql` and
`migrations/fieldly/*.sql`:

1. `migrations/auth/0001_auth.sql` — generated Better Auth identity/session schema (kept byte-for-byte).
2. `migrations/fieldly/0001_fieldly_core.sql` — marketplace data model.
3. `migrations/fieldly/0002_lock_down_browser_data_access.sql` — browser database access lockdown and RLS.
4. `migrations/auth/0002_phone_number_fields.sql` — verified phone-number columns for Better Auth.
5. `migrations/auth/0003_rate_limit.sql` — persistent Better Auth request counters with RLS enabled.
6. `migrations/auth/0004_lock_down_auth_data_access.sql` — Better Auth table-only browser access lockdown.
7. `migrations/fieldly/0005_provider_onboarding.sql` — provider details, ownership foreign keys and document-requirement checklist.

Both production and PGLite migration discovery explicitly include these folders.
The Fieldly SQL is also tested independently without auth tables so its
PostgreSQL schema does not depend on Supabase Auth UUIDs.

`supabase/schema.sql` is retired. It contains an explanatory notice only; do not apply it. Its earlier `auth.uid()` policies assumed Supabase Auth identities and are incompatible with this app's Better Auth identity model.

For setup and migration verification, see [docs/production-backend-setup.md](docs/production-backend-setup.md).

## Render

The repository includes `render.yaml` as a starting point for a Render Node web service. It specifies Node.js 22, `npm install && npm run build`, and `npm run start`.

Production secrets must be configured only in Render's Environment settings. The production app must have a real Better Auth identity configuration, a strong `BETTER_AUTH_SECRET`, and a Supabase PostgreSQL `DATABASE_URL`. Do not put database URLs, passwords, OAuth secrets, payment secrets or private keys in frontend variables or GitHub.

If production authentication has not been provisioned, do not connect a real database to the public application and do not accept live bookings. The server is intended to fail closed rather than use a shared demo identity against real data.

## Authentication and data security

Better Auth is the intended identity source. Fieldly ownership columns use TEXT user IDs rather than Supabase Auth UUIDs. The generated Better Auth SQL remains untouched; the app-owned Fieldly SQL is independently testable and does not rely on Supabase Auth. Local preview still uses the fixed-code demo. Production phone sign-in is wired through Better Auth Phone Number and MSG91 Flow when the private MSG91 and Better Auth credentials are configured. The SMS template must be approved under Indian DLT requirements. Provider registration now has an authenticated database submission path, but that path requires a verified +91 phone session. Provider dashboard retrieval is now backed by owner-scoped server reads for businesses, services, machinery and document-checklist status. Admin review/approval, private document upload, approved-provider discovery, availability, booking operations, GPS, chat and payments still need their server-side workflow integrations.

The database is accessed from the server through `src/lib/db.ts`. Supabase Data API roles `anon` and `authenticated` receive no access to Fieldly application tables; RLS is enabled without browser-facing policies. Client-facing operations must use authenticated server functions with verified session context and explicit customer/provider/admin ownership checks.

Private KYC/document bytes belong in a private Supabase Storage bucket. Store file metadata in PostgreSQL and use short-lived signed URLs after server-side ownership checks. Never store full PAN, Aadhaar, bank account numbers, IFSC, payment card data or raw OTPs in browser storage.

A database credential was previously committed in this repository's README, and an upstream preview OAuth credential was hard-coded in source. Treat exposed credentials as compromised: rotate/revoke them with the service owner, update any legitimate deployment using them, and review Git history. Removing a secret from the latest file does not remove it from older commits. Do not restore credentials to source files or commit a real `.env` file.

## Payment gateway evaluation

Cashfree Easy Split and Razorpay Route are both under evaluation. See [docs/payment-gateway-evaluation.md](docs/payment-gateway-evaluation.md). No gateway is selected or enabled. Any real checkout must use server-created orders, verified webhooks, idempotent ledger updates, reconciliation and audited vendor settlement.

## Technology stack

React 19, TanStack Start/Router, Vite, TypeScript, Tailwind CSS 4, Lucide, MapLibre GL, Zustand, Node.js, Render and Supabase PostgreSQL.
