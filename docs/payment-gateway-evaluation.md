# MakeService payment gateway evaluation

**Status:** evaluation only. No gateway has been selected, no merchant account
has been approved, and no live payment integration is enabled.

## MakeService requirements

The payment provider must support more than customer checkout. MakeService needs:

- Indian customer payments, especially UPI, cards and netbanking.
- Verified provider/vendor onboarding and payout destination checks.
- A platform commission and a separately calculated provider share.
- A way to delay provider settlement until the service is completed or an
  explicitly approved platform release condition is met.
- Full and partial refunds, including adjustment when a provider has already
  received a settlement.
- Signed webhooks, event deduplication, payment reconciliation,
  transfer/settlement reports and dispute support.
- Written commercial and compliance approval for an Indian on-demand
  services marketplace.

## Feature comparison

| Requirement | Cashfree Easy Split | Razorpay Route |
|---|---|---|
| Marketplace model | Multi-vendor marketplace split product | Linked-account marketplace / third-party payouts |
| Provider onboarding | Vendor management APIs | Linked Accounts and onboarding |
| Commission | Platform commission can be deducted from vendor split | Platform-defined transfer amounts |
| Deferred settlement | Vendor settlement schedules; split-after-payment and on-demand transfers | Transfer settlement can be held and later released |
| Refunds / reversals | Refund APIs and vendor-balance adjustments | Payment refunds, transfer reversals and linked-account refund workflows |
| Reconciliation | Vendor, split and settlement reports | Transfer, reversal and settlement reports |
| Customer gateway | Cashfree Payment Gateway is activated with Easy Split | Razorpay Payment Gateway is used with Route |
| Main approval question | Easy Split eligibility, vendor KYC and negotiated fees | Route approval and payer-payee transparency requirements |

## What the official material confirms

**Cashfree Easy Split** explicitly supports vendor creation/management, payment
splits, flexible settlement schedules, on-demand vendor transfers, refunds,
vendor balance adjustments and reconciliation. Cashfree's product description
also says that Easy Split is integrated with Cashfree Payment Gateway; it is
not a neutral split layer over an unrelated gateway. Its marketplace use-case
material describes split-after-payment, deferred settlement, refunds before
and after a split, and configurable vendor settlement schedules.

**Razorpay Route** supports linked accounts, transfers from captured payments
or orders, settlement holds, payment refunds, transfer reversals and settlement
reports. However, Razorpay's Route compliance documentation asks businesses to
supply payer-payee transparency information and states that the linked account
must directly interface with the customer to provide goods or services. It
describes written confirmation and review of the use case. Since MakeService
operators perform the field service for the customer, this may fit the model,
but we must submit the exact flow and obtain written approval before relying on
Route.

Official sources:

- Cashfree Easy Split overview:
  https://www.cashfree.com/docs/api-reference/payments/latest/split/easy-split-overview
- Cashfree Easy Split product and refund/split details:
  https://www.cashfree.com/easy-split/split-payment-gateway/
- Cashfree marketplace use cases:
  https://cashfree.myfaqprime.com/880/what-are-the-different-use-cases-of-easy-split
- Razorpay Route product and transfer holds:
  https://razorpay.com/route/
- Razorpay Route compliance / payer-payee transparency:
  https://tfs.np.razorpay.in/docs/payments/route/
- Razorpay Route APIs and transfer holds:
  https://razorpay.com/docs/api/payments/route/create-transfers-payments/
- RBI's current PA-CB notification, which references the domestic PA
  guidelines dated 17 March 2020:
  https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12561&Mode=0

## Preliminary recommendation

**Take Cashfree Easy Split to the first technical/commercial discovery call. Keep
Razorpay Route as the comparison option. Do not select either yet.**

Cashfree's published Easy Split feature set maps closely to the intended
MakeService model: a customer pays for a job, MakeService retains an agreed
platform commission, and the service provider receives their share on an
approved settlement schedule. Razorpay Route also has the core transfer,
settlement-hold, refund and reversal features, but its payer-payee transparency
review is a specific onboarding gate to resolve for this platform.

This is a product-fit recommendation, not confirmation that either provider
will approve MakeService. Both providers must review the actual business model,
provider relationship, money flow and refund/cancellation policy.

A specific MakeService requirement is still open: the current UI design places
customer payment after service completion. That is different from taking an
advance at booking and holding a provider transfer until the job ends. Keep the
first release aligned to the completed-job payment flow unless we deliberately
change the product design. Ask both providers to confirm the exact split,
refund and settlement treatment for that flow. If later adding booking advances,
confirm transfer holds and maximum release windows against the actual job and
dispute duration.

## Questions to send to both providers

1. Is MakeService's exact marketplace model approved: customer books an
   independent operator, MakeService collects the customer payment, deducts a
   platform commission, and pays the assigned operator after job completion?
2. Which legal entity, GST, KYC, vendor, beneficial-owner and bank/UPI documents
   are required from MakeService and each provider?
3. Can provider onboarding and bank/UPI verification be completed through APIs?
   Which steps require manual review or dashboard action?
4. Can provider settlement be held until the customer confirms completion or
   until a dispute window closes? What are the maximum hold periods and release
   conditions?
5. How are full and partial refunds handled before and after vendor settlement?
   How are shortfalls, negative vendor balances and transfer reversals recovered?
6. Who owns chargebacks and disputes? What are the webhook retry and
   reconciliation-report arrangements?
7. Provide a written fee sheet covering checkout MDR, Easy Split/Route fees,
   transfer/payout fees, refunds, chargebacks, GST, reserves and settlement
   minimums.
8. Confirm the regulatory and contractual funds-flow model for an Indian
   marketplace under the RBI Payment Aggregator framework: who is the
   collecting merchant, whether MakeService requires any separate
   authorisation/arrangement, how escrow/settlement accounts are handled, and
   who owns merchant KYC, customer refunds and disputes. Get this in writing
   from the gateway and have Indian payments counsel review the final flow.

Do not compare only advertised checkout MDR. Effective cost is checkout fees +
marketplace split/transfer fees + payout fees + refund/chargeback exposure +
finance/reconciliation operations.

## Data model preparation

The Fieldly schema reserves tables for payment intents, provider payout profiles
and deduplicated webhook events. It stores gateway identifiers and masked payout
metadata only. It deliberately does not store card data, full bank-account
numbers, IFSC, PAN or Aadhaar images.

Gateway credentials must be server-side Render environment variables. Payment
state must change only after a verified signed webhook or server-side status
verification. A browser redirect or success screen must never set a booking to
paid.
