# Fieldly — Cashfree Easy Split integration plan

**Decision:** pursue Cashfree Payment Gateway + Easy Split as the first marketplace payment provider. This is not an approval or a live integration.

## Why Cashfree is the better first fit

Fieldly is not just a checkout page. It is a local services marketplace where customers book an operator, the operator supplies the machinery/service, and Fieldly may earn an agreed marketplace commission. The required capabilities are:

- Customer checkout for a specific booking stage.
- Provider/vendor onboarding and KYC status.
- Splitting an eligible payment between the service provider and Fieldly.
- Provider settlement schedules and settlement reporting.
- Refunds, reversals/adjustments and reconciliation.
- Webhooks and payment-status lookup.

Cashfree Easy Split publishes these marketplace capabilities and exposes vendor, split, transfer, refund and reconciliation APIs. Easy Split is used with Cashfree Payment Gateway; do not build a custom pooled-account or escrow-like flow in Fieldly.

Razorpay Route is a credible alternative and provides linked accounts, transfers, reversals, refunds and settlement tooling. Its currently published eligibility criteria require either more than ₹40 lakh of domestic turnover in FY25/FY26 or more than ₹5 lakh export turnover in FY25/FY26, plus a payer–payee transparency review. That makes it a less certain first route for a new marketplace.

Cashfree publicly lists an Easy Split platform fee of 0.20%–0.25% of order value in addition to normal payment-gateway charges. This is only a published indicative fee: get a written commercial quote for Fieldly, confirm GST on fees, settlement fees, refunds, chargebacks and any minimums.

## Current application state — important launch blocker

The current Fieldly marketplace business store (src/lib/fieldly/store.ts) persists customer/provider sessions, requests, quotes, bookings, messages and reviews in browser localStorage. A customer and provider on separate devices therefore do not share a canonical marketplace record.

The current quote-acceptance function immediately creates a local CONFIRMED booking, and the booking screen later displays a "Preview only. No money moves" payment action. It is not connected to Cashfree or a shared payment database.

The repository has a server-only PostgreSQL abstraction and an in-memory PGlite fallback, but those do not by themselves move Fieldly's browser-local booking state into the shared database. The starter Supabase schema is also not the active Fieldly store.

**For those reasons this change adds a payment schema and state rules only. It does not create Cashfree orders, display a real checkout, onboard real vendors, or transfer funds.** Do not enable live payments until the marketplace records and identity have been migrated and server-side authorization is in place.

## Intended customer and provider journey

1. Provider submits a quote with a full scope, inclusions, exclusions, unit/measurement basis, possible extra charges, schedule and cancellation/rescheduling terms.
2. Customer reviews and accepts the quote terms. The server locks the accepted quote and creates the booking in an awaiting-payment state—not CONFIRMED.
3. Server calculates the stage amount and the provider/platform split from a versioned, server-controlled commission policy. Do not trust amount, provider ID, commission or booking ownership sent by the browser.
4. Server creates a Cashfree order using a unique idempotency key and returns only the checkout session information needed by the client.
5. Customer completes Cashfree hosted checkout. The browser return URL is for user experience only; it is not proof of payment.
6. A server webhook verifies the Cashfree signature against the exact raw request body and timestamp before recording or processing the event. The handler must be idempotent, tolerate duplicates and out-of-order events, and use Cashfree's order/payment status API to resolve ambiguous states.
7. Only after a verified successful payment does the server mark the relevant payment stage paid and advance the booking to confirmed/ready. Persist gateway IDs and sanitized status details, never card, CVV, UPI PIN or checkout secrets.
8. Provider arrival/start OTP and service-completion workflow continue. Larger work can have new server-created milestone payment orders, each independently reconciled.
9. Final payment is a separate order stage after measured work/invoice and customer agreement. Cashfree Easy Split then performs vendor settlement according to the approved contract and configured schedule.
10. Refund requests are recorded against captured payments; the server checks remaining refundable balance and uses a unique refund idempotency key. Reconcile successful/failed refunds and provider balance adjustments. Never claim a refund is complete before the gateway confirms it.

## Category-specific payment policy

Do not force the same advance percentage onto every service type:

| Service | Suggested starting model |
|---|---|
| Borewell drilling/deepening | Agreed mobilisation advance; measured progress milestones where suitable; final balance from verified depth/approved variation |
| JCB/excavation | Mobilisation advance if travel is material; reconcile actual operating hours and agreed extras |
| Crane | Mobilisation advance; balance on agreed lifting period/scope |
| Tipper | Mobilisation advance; balance by verified trip/load count |
| Tractor/agriculture | Small token or post-service payment where practical |
| Water tanker | Pay on delivery or modest agreed advance for a dedicated trip |
| Equipment rental | Advance tied to rental period, with disclosed extension/damage rules |
| Multi-day construction | Explicit written milestone schedule and acceptance evidence |

The actual advance amount is negotiated per quote and should be reasonable, visible before acceptance and covered by a clear refund/cancellation policy. No blanket "non-refundable" term should be applied without legal review.

## Provider onboarding

- Create a Cashfree vendor account only after the service provider has accepted marketplace terms and the platform has verified the provider identity/business through a documented onboarding process.
- Use Cashfree's vendor/KYC onboarding API and follow Cashfree's current rules for proprietors, individuals, firms, bank accounts and permitted UPI settlement destinations.
- Keep providers in a non-bookable or online-payment-disabled state until Cashfree reports the vendor as active and eligible for settlement.
- Do not store full Aadhaar/PAN images, account numbers, IFSC proof or raw KYC payloads in the Fieldly business database unless a documented legal requirement demands it. Prefer sending required onboarding data directly to Cashfree through a protected server flow and storing the Cashfree vendor ID plus normalized status.
- Confirm whether Cashfree can onboard the mix of individual equipment owners, sole proprietors and local service firms Fieldly expects, and which GST/PAN/business details are mandatory for each category.

## Marketplace/settlement questions to get answered in writing by Cashfree

1. Does Easy Split approve Fieldly's exact services: borewell drilling, machinery hire, JCB/crane/tipper/tractor rentals, tanker delivery and multi-day site work?
2. Is Fieldly classified as an online marketplace/e-commerce operator, and what business documents, website pages, seller agreements and GST registrations are required?
3. Can the customer pay booking advance, later milestones and a final balance as separate Cashfree orders, each with its own vendor/platform split?
4. What are the allowed vendor settlement schedules and maximum delay? Is settlement after physical service completion permitted for these use cases? Do not design around a hold period unless Cashfree explicitly confirms it in the contract.
5. What happens if a provider has already been settled and Fieldly later issues a full/partial refund or a chargeback? Can Cashfree debit/recover the vendor balance, and what happens if the balance is insufficient?
6. Can a split allocate the service provider's share and Fieldly's commission for each milestone independently? How are payment-gateway charges, refunds and chargebacks allocated?
7. What are the complete charges: payment instruments, Easy Split fee, vendor settlements/transfers, refunds, chargebacks, failed payments and GST?
8. What are the vendor onboarding restrictions, KYC turnaround times, per-vendor limits and supported settlement bank/UPI methods?
9. Which webhook event versions and API version are enabled on the Fieldly merchant account? Confirm the current API version and production base URL.
10. What is the documented process for reconciliation and provider payouts when payment is disputed or the provider account becomes inactive?

Do not launch the provider-split feature based on a sales conversation alone. Save Cashfree's written approval and merchant agreement with the release records.

## Proposed technical design

### Payment tables added in this foundation

- fieldly_payment_provider_accounts: internal provider reference, Cashfree vendor ID, normalized onboarding status and optional settlement schedule identifier.
- fieldly_payment_orders: booking/quote/customer/provider references, payment stage, amount in paise, provider/platform allocations, commission basis points, Cashfree order ID, status and idempotency key.
- fieldly_payment_attempts: gateway payment ID, method, outcome and bank reference.
- fieldly_payment_webhook_events: SHA-256 event fingerprint, verified-signature flag, allowlisted metadata and processing state. Raw webhook body and signature are not persisted.
- fieldly_payment_refunds: refund ID, amount in paise, status, reason and idempotency key.
- fieldly_vendor_settlements: Cashfree vendor/settlement/transfer references, amount and status.
- fieldly_payment_ledger_entries: append-only-by-service-convention debit/credit records. Every journal must balance and be inserted transactionally.

The current database migration deliberately does not foreign-key payment rows to booking/provider tables because the live Fieldly booking/provider model is still in browser-local storage. Add those FKs only after migrating canonical records.

### State and money rules

- Store INR values as integer paise, not JavaScript floating-point rupees.
- Commission is configured server-side in basis points (100 bps = 1%). Never hard-code one universal commission or accept a client-supplied commission.
- A stage payment split must satisfy provider share + platform share = amount paid. Gateway fees are separately reconciled as per the merchant agreement.
- Use idempotency keys for order creation, webhook processing, refunds, transfers and ledger posting.
- Recheck current booking, quote, customer, provider and payment ownership inside the same server-side transaction before creating an order.
- Do not mark a booking confirmed/paid based on a browser callback, query parameter or screenshot.
- Store a payment as pending/unknown if a timeout occurs; query Cashfree before retrying with a new order.
- Reconcile Cashfree payments, refunds and settlements against internal records on a scheduled basis.

### Server-only configuration (future, not active)

Configure these only in the deployment provider's server environment settings, not in frontend VITE variables and never in Git:

- CASHFREE_CLIENT_ID
- CASHFREE_CLIENT_SECRET
- CASHFREE_ENVIRONMENT=sandbox initially; production only after approval and testing
- CASHFREE_API_VERSION (confirm the version enabled for the merchant account; current vendor API docs show 2026-01-01)

Do not paste secrets into chat, source files, issues or pull requests. Rotate any secret that has accidentally been committed.

## Compliance and release checks

Before the first live transaction, get an Indian CA and payments/e-commerce counsel to confirm:
- Fieldly's legal role and contracts as marketplace/ECO versus principal supplier.
- GST registration and invoicing responsibility, Section 52 TCS applicability, supplier registration/threshold exemptions, service classification and any Section 9(5) treatment.
- Income-tax marketplace TDS under the Income-Tax Act 2025, including provider PAN/Aadhaar collection, threshold exemptions, returns and certificate process.
- Provider terms, commission and payout statements, cancellation/refund rules, disputes, grievance redressal, customer disclosures and total-price/tax breakup.
- DPDP privacy notice, lawful handling/retention of provider KYC information, location data and customer site photos.
- Consumer Protection E-Commerce Rules and amendments applicable at launch (the 2026 amendment is scheduled to take effect on 1 January 2027).

No wallet balance, stored value, customer-to-provider transfer feature or Fieldly-held escrow should be introduced without separate regulatory advice and written PA approval.

## Delivery sequence

1. **Foundation (this PR):** schema, paise/split utility, payment state-transition tests and integration checklist. No checkout or live API.
2. **Backend readiness:** migrate customers, providers, quotes and bookings to canonical PostgreSQL records; enforce real authentication/authorization; add payment service endpoints and audit logging.
3. **Cashfree sandbox:** after marketplace approval, onboard test vendors, create test orders, test hosted checkout, signed/duplicate/out-of-order webhooks, partial/full refunds, failed/timeout payments, split transfers and settlement reconciliation.
4. **Controlled production pilot:** only after CA/legal review, Cashfree production approval, policy pages and operational reconciliation are ready. Start with one service category and limited verified providers.

**Release status:** this foundation is not production payment processing. No Cashfree API call, checkout, provider payout or real-money transaction is enabled by this change.
