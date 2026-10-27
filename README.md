# Fieldly — local service marketplace

Fieldly is a responsive marketplace prototype for discovering equipment and site services across India: borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers, and related work.

**Live preview:** https://makeservice.onrender.com/

## Current status: prototype, not ready for real bookings

The repository contains the user interface and prototype workflows. The main Fieldly marketplace store in `src/lib/fieldly/store.ts` persists sessions, provider changes, requests, quotes, bookings, messages, and reviews in browser `localStorage`. This is per-browser demo state, not a shared marketplace database.

The location picker supports searches across India and quick shortcuts for major cities. The current seeded provider catalogue is still concentrated around Warangal/Hanamkonda, so other cities may show no example providers until real regional listings are connected.

The sign-in page uses a fixed preview code. Provider records, ratings, prices, reviews, and verification flags include seeded demo data. Payment confirmation is also a local preview action; it does not move money. Do not use these flows to accept real customers, payment, identity documents, or sensitive information.

## Requirements

- Node.js 22
- npm
- VS Code (recommended)

## Run locally

1. Clone or download this repository.
2. Open the repository root in VS Code.
3. Run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL printed by the terminal (normally `http://localhost:8080`).

## Build and checks

```bash
npm run build
npm run typecheck
npm test
npm run lint
``

Run these checks locally and review the output before deploying changes. A successful GitHub push or a live Render URL is not, by itself, evidence that the production workflows are safe.

## Render

The repository includes `render.yaml` as a starting point for a Render Node web service. It specifies Node.js 22, `npm install && npm run build`, and `npm run start`.

Configure production secrets only in Render's Environment settings. Do not commit database URLs, passwords, OAuth secrets, or other credentials to GitHub.

## Supabase integration status

`supabase/schema.sql` is a starter schema, not a completed integration. The current Fieldly UI/store does not use the Supabase JavaScript client for marketplace records, and adding a URL or database connection string alone will not make bookings shared across devices. The existing database adapter and migration script serve a separate server-side database/auth setup and do not automatically apply `supabase/schema.sql`.

Before enabling a real backend:
1. Select and implement one production authentication system.
2. Review and replace the starter database policies; test every allowed and denied action with customer, provider, and administrator identities.
3. Move request, quote, booking, message, provider, and review writes to authenticated server/database operations.
4. Add verified provider onboarding, secure document storage, notifications, payment-provider verification, monitoring, and backups.
5. Add automated workflow tests and verify the deployment before launch.

Never put a Supabase secret/service-role key or a database password in frontend code. Browser code may use a publishable/anon key only with appropriately secured and tested RLS policies.

## Security response required

A database credential was previously committed in this repository's README, and an upstream preview OAuth credential was hard-coded in source. Treat exposed credentials as compromised: rotate/revoke them with the service owner, update any legitimate deployment using them, and review Git history. Removing a secret from the latest file does not remove it from older commits. The preview OAuth code now reads optional values from server environment variables instead of embedding a secret. Do not restore credentials to source files or commit a real `.env` file.

## Technology stack

React 19, TanStack Start/Router, Vite, TypeScript, Tailwind CSS 4, Lucide, MapLibre GL, Zustand, Node.js, and Render. Supabase/PostgreSQL remains planned for the production marketplace and is not yet connected to the current Fieldly business workflows.
