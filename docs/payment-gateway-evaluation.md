# MakeService payment gateway evaluation

**Status:** evaluation only. No gateway has been selected, no merchant account has been approved, and no live payment integration is enabled.

## MakeService requirements

The payment provider must support more than customer checkout. MakeService needs:

- Indian customer payments, especially UPI, cards and netbanking.
- Verified provider/vendor onboarding and payout destination checks.
- A platform commission and a separately calculated provider share.
- A way to delay provider settlement until the service is completed or an explicit platform release condition is met.
- Full and partial refunds, including adjustment when a provider has already received a settlement.
- Signed webhooks, event deduplication, payment reconciliation, transfer/settlement reports and dispute support.
- API access and commercial approval for an Indian on-demand services marketplace.

## Current comparison

| Requirement | Cashfree Easy Split | Razorpay Route |
|---|---|---|
| Marketplace model | Explicit multi-vendor / marketplace split product | Explicit marketplaces, on-demand services and service aggregators |
| Provider onboarding | Vendor APIs and vendor management | Linked Accounts and linked-account onboarding |
| Platform commission | Split rules support a platform share | Transfers support platform-defined split amounts |
| Deferred settlement | Settlement schedules and on-demand transfer options | Default/scheduled settlement and transfers that can be put on hold |
| Refunds / reversals | Refund APIs and vendor-balance adjustments | Refund capability for linked accounts and transfer reversals |
| Reconciliation | Vendor reconciliation and split/settlement reports | Transfer, reversal and settlement reporting |
| Integration scope | Cashfree Payment Gateway is part of Easy Split setup | Razorpay Payment Gateway plus Route linked accounts/transfers |
| Main item to verify commercially | Eligibility, vendor KYC, settlement/refund policy and negotiated pricing | Route approval, linked-account eligibility, settlement/refund policy and negotiated pricing |

## Sources

- Cashfree Easy Split overview: https://www.cashfree.com/docs/api-reference/payments/latest/split/easy-split-overview
- Cashfree Easy Split product detail: https://www.cashfree.com/easy-split/split-payment-gateway/
- Razorpay Route: https://razorpay.com/route/
- Razorpay Route transfer reporting: https://razorpay.com/docs/api/payments/route/fetch-transfers-for-a-settlement/

## Initial recommendation

Keep both providers in the evaluation. Cashfree Easy Split is the first candidate to take into a technical and commercial discovery call because its product surface explicitly covers vendor management, split orders, on-demand transfers, vendor reconciliation and refunds. Razorpay Route is also a credible fit: it explicitly targets on-demand services and service aggregators, supports linked accounts, transfers, settlement holds and reversals.

This is not yet a final selection. Request written answers from both providers on:

1. Whether MakeService's exact model (customer pays for a service, the platform retains a commission, the operator is paid after job completion) is approved under their marketplace/aggregator policy.
2. Whether provider onboarding and KYC can be completed fully through APIs, and which business documents, bank/UPI evidence and minimums apply.
3. Whether transfers can be held until job completion and how long a hold can last.
4. Full/partial refund treatment before and after vendor settlement, including negative balances and recovery.
5. Chargeback ownership, dispute workflow, settlement schedules, webhook retry policy and reconciliation exports.
6. All gateway MDR, Route/Easy Split fees, payout fees, refund fees, GST, reserves and minimum settlement rules.

Do not compare only advertised gateway MDR. The effective cost is checkout charges + marketplace split/transfer fees + payout fees + refunds/chargebacks + operational reconciliation effort.

## Data model preparation

The production schema includes provider payout profiles, payment intents and deduplicated webhook-event storage, with gateway identifiers and masked payout metadata only. It deliberately does not store card data, full bank-account numbers, PAN or Aadhaar images.

Gateway credentials must be server-side environment variables in Render. Payment state must change only after a signed webhook or a server-side status verification. A browser redirect or success screen must never set a booking to paid.
