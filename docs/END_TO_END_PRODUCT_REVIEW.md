# Fieldly end-to-end product review

**Scope:** Static review of the current repository and the UI improvements in this branch. This is not a claim of a successful real-device E2E run or a production security certification.

## Current frontend journey

1. **Landing:** equipment-led hero, Manual / Map / Use my location choices, feature strip, popular service cards, service search after a location is confirmed.
2. **Work site:** enter State/UT, District, City/Town/Village, six-digit PIN, exact address, optional landmark; advance to select the exact map pin; or choose a place from search / use device GPS and review the suggested address.
3. **Service request:** select service, fill service-specific requirements, choose a time window, and add notes.
4. **Discovery:** find candidate local catalogue entries and inspect provider information, distance estimate, service fit and pricing estimate.
5. **Request / quote / booking:** the local prototype creates a request, quote records and a booking after a quote is accepted.
6. **Work lifecycle:** the prototype models confirmed → on the way → arrived → service started (after start-code check) → completed → paid; it also exposes cancellation/dispute and review UI.
7. **Provider workflows:** local provider registration, operator desk, availability toggles and quote editing are present.
8. **Account / navigation:** customer/provider screens, responsive navigation, language selection, bookings and messaging UI exist.

## Important boundary

The browser experience is a prototype, not a production marketplace. The following are not made production-ready by frontend styling work:

- **Identity / OTP:** customer and provider sign-in use a fixed preview code; no SMS OTP is actually delivered. Client-side sessions can be changed in the browser.
- **Shared data:** requests, quotes, messages, bookings, reviews and provider changes use the browser-persisted Zustand store. Two different devices do not share authoritative records or real-time updates.
- **Provider inventory:** seeded names, contact data, ratings, prices, reviews, coordinates, online flags and verification flags are demo data, concentrated in the Warangal/Hanamkonda area. They must not be described as live verified availability.
- **Quotes:** creating a request currently generates local pending quote records from catalogue prices; these are not proof that an operator received or replied to the request.
- **Documents / verification:** provider document checkboxes are not private document upload or an independent admin review process.
- **Payments:** the paid state is a local record. No money is transferred and no gateway webhook reconciles payments.
- **Notifications:** the app has no live SMS, push, email or cross-device event pipeline.
- **Database:** the checked-in Supabase schema is a starter file. The fieldly workflow is not yet backed by authenticated Supabase queries/RPCs, tested RLS, or a completed production migration pipeline.
- **Location providers:** address lookup and map tiles depend on third-party services. Geocoded State/District/City fields need customer review; exact address components vary by location.

## Release blockers before accepting real users

### P0 — Identity and authorization
Implement a real authentication provider and enforce ownership on the server for every read/mutation. Do not accept client-supplied role, owner, amount, status, verification, or payment state as trusted.

### P0 — Shared authoritative data
Move providers, work sites, requests, quotes, messages, bookings, audit events and reviews to a real backend. Add constraints/transactions for booking state transitions, quote acceptance and double-booking.

### P0 — Supabase policy review
Review grants and each RLS policy with separate customer/provider/admin identities. Prevent role self-promotion and owner changes to verification/rating fields. Expose only public-safe provider fields. The current starter policies are not suitable as production authorization without redesign and tests.

### P0 — Payments and documents
Use a payment provider with server-side webhook verification and reconciliation. Upload documents to private storage, enforce authorization, and have a trusted admin review process. Never let a provider mark their own credentials as verified.

### P1 — Operational reliability
Add real provider notifications and request expiry, server-side availability, idempotent actions, retries, monitoring, audit logging, rate limits, abuse handling, customer support/dispute process, privacy policy/retention controls and backup/restore checks.

### P1 — Maps and nationwide coverage
Use a supported, licensed map/geocoding strategy with attribution, request limits, timeouts, fallback behaviour and a formal India State → District → locality data source if structured manual selection is required. Do not imply nationwide provider coverage before real providers are onboarded.

### P1 — Quality verification
Run Playwright or equivalent end-to-end tests at mobile, tablet and desktop breakpoints. Cover manual location → map pin → service form → discovery → request → provider quote → customer acceptance → booking progression → start code → completion → payment callback → review. Add keyboard-only, screen-reader, slow-network, GPS-denied, map-tile-failure and session-expiry cases.

## How to interpret validation

A successful TypeScript check, automated test suite and production bundle validate code quality/buildability; they do not prove live provider coverage, real OTP, real payments, backend authorization, maps in every region, or a deployed Render release. Production deployment must be confirmed separately in Render, then smoke-tested at the live URL on desktop and mobile.
