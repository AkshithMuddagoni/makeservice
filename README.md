# Fieldly — MakeService local-services marketplace

Fieldly is a responsive marketplace for discovering equipment and site services across India: borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers, and related work.

**Live preview:** https://makeservice.onrender.com/

## Current status: prototype UI + production backend foundation in progress

The existing customer/provider screens remain a prototype. The main Fieldly marketplace store in `src/lib/fieldly/store.ts` still persists sessions, provider changes, requests, quotes, bookings, messages, and reviews in browser `localStorage`. That is per-browser demo state, not a shared marketplace database.

The sign-in page still uses a fixed preview code. Provider records, ratings, prices, reviews, and verification flags include seeded demo data. Payment confirmation remains a local preview action and does not move money. Do not use these UI workflows to accept real customers, payment, identity documents, or sensitive information.

A new branch, `feat/production-backend-foundation`, contains the first backend foundation:
- Ordered Better Auth + Fieldly PostgreSQL migrations.
- Better Auth TEXT user IDs (not Supabase Auth UUIDs).
- Core marketplace schema for businesses, provider services, assets, documents, job requests, quotes, bookings, messages, location, payments and reviews.
- Browser-role database lockdown and RLS enablement.
- Authenticated server functions for creating/reading the current Fieldly account.
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

The app-owned schema is in `migrations/fieldly/*.sql`:

1. `0001_fieldly_core.sql` — marketplace data model.
2. `0002_lock_down_browser_data_access.sql` — browser database access lockdown and RLS.

The generated Better Auth schema remains in `migrations/auth/0001_auth.sql` and is not automatically applied in the auth-off demo. When real auth is provisioned, the existing auth-on workflow copies that file byte-for-byte to `migrations/0001_auth.sql`.

`supabase/schema.sql` is retired. It contains an explanatory notice only; do not apply it. Its earlier `auth.uid()` policies assumed Supabase Auth identities and are incompatible with this app's Better Auth identity model.

For setup and migration verification, see [docs/production-backend-setup.md](docs/production-backend-setup.md).

## Render

The repository includes `render.yaml` as a starting point for a Render Node web service. It specifies Node.js 22, `npm install && npm run build`, and `npm run start`.

Production secrets must be configured only in Render's Environment settings. The production app must have a real Better Auth identity configuration, a strong `BETTER_AUTH_SECRET`, and a Supabase PostgreSQL `DATABASE_URL`. Do not put database URLs, passwords, OAuth secrets, payment secrets or private keys in frontend variables or GitHub.

If production authentication has not been provisioned, do not connect a real database to the public application and do not accept live bookings. The server is intended to fail closed rather than use a shared demo identity against real data.

## Authentication and data security

Better Auth is the intended identity source. Fieldly ownership columns use TEXT user IDs rather than Supabase Auth UUIDs. The app-owned SQL migrations are independent of the optional Better Auth migration so the local auth-off preview can still build its schema.

The database is accessed from the server through `src/lib/db.ts`. Supabase Data API roles `anon` and `authenticated` receive no access to Fieldly application tables; RLS is enabled without browser-facing policies. Client-facing operations must use authenticated server functions with verified session context and explicit customer/provider/admin ownership checks.

Private KYC/document bytes belong in a private Supabase Storage bucket. Store file metadata in PostgreSQL and use short-lived signed URLs after server-side ownership checks. Never store full PAN, Aadhaar, bank account numbers, IFSC, payment card data or raw OTPs in browser storage.

A database credential was previously committed in this repository's README, and an upstream preview OAuth credential was hard-coded in source. Treat exposed credentials as compromised: rotate/revoke them with the service owner, update any legitimate deployment using them, and review Git history. Removing a secret from the latest file does not remove it from older commits. Do not restore credentials to source files or commit a real `.env` file.

## Payment gateway evaluation

Cashfree Easy Split and Razorpay Route are both under evaluation. See [docs/payment-gateway-evaluation.md](docs/payment-gateway-evaluation.md). No gateway is selected or enabled. Any real checkout must use server-created orders, verified webhooks, idempotent ledger updates, reconciliation and audited vendor settlement.

## Technology stack

React 19, TanStack Start/Router, Vite, TypeScript, Tailwind CSS 4, Lucide, MapLibre GL, Zustand, Node.js, Render and Supabase PostgreSQL.
