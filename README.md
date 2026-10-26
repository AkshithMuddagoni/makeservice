# Fieldly — local service marketplace

A responsive service-booking marketplace for borewell drilling, JCB/excavator hire, cranes, tractors, water tankers, tippers and related site services. This package is based on the supplied project source.

## Requirements
- Node.js 22 LTS (Node 20.19+ may work, but Node 22 is recommended)
- npm
- VS Code (recommended)

## Run locally
1. Extract the ZIP.
2. Open the extracted `fieldly-marketplace` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Open the local URL printed by Vite (normally `http://localhost:8080`).

No API keys are required for the local demo. The app includes sample service providers and locations around Warangal/Hanamkonda. Customer/provider sessions, requests, quotes and bookings currently use browser-local persisted state, so they are a functional prototype and are not shared between different browsers/devices.

## Production deployment on Render

The repository includes `render.yaml` as a starting point for a Render Node web service.

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository, or create a Node web service manually.
3. Use the build command `npm install && npm run build`.
4. Use the start command `npm run start`.
5. Set `NODE_VERSION` to `22` if Render does not select Node 22 automatically.

Do not add a `DATABASE_URL` until you have configured the database integration and applied the schema. The current UI's booking state is browser-local and will not become a shared database simply by adding a connection string.

## Supabase

Supabase is a good PostgreSQL/auth/storage choice for the production version. The `supabase/schema.sql` file is a starter schema for profiles, provider listings, bookings, quotes and reviews. To connect it for real production use, the frontend/store actions must be migrated from local browser persistence to authenticated Supabase queries, and Row Level Security policies must be tested. Never put a Supabase `service_role` key in frontend code; only the project URL and publishable/anon key may be used in a browser, with RLS enabled.

## Important production checklist
- Replace sample provider listings and sample prices with verified real data.
- Integrate Supabase Auth and database-backed bookings/quotes.
- Configure phone OTP through a supported Supabase Auth SMS provider (may have provider charges).
- Configure maps/geocoding and review map-provider terms and quotas.
- Add server-side authorization, rate limits, audit logs and booking conflict handling.
- Add a real payment provider only after business/legal requirements are confirmed.
- Test RLS with separate customer/provider accounts before accepting real users.

## Useful commands

```bash
npm run dev       # local development server
npm run build     # production build
npm run start     # serve production build
npm run typecheck # TypeScript check
npm test          # project tests
```

## Stack
React 19, TanStack Start/Router, Vite, TypeScript, Tailwind CSS 4, Lucide icons, MapLibre GL, Zustand. Render can host the Node application; Supabase can provide PostgreSQL, authentication and file storage once the app data layer is connected.
