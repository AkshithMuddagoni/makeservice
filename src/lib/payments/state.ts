/**
 * Payment-order rules shared by the server payment service and its tests.
 *
 * This module deliberately contains no Cashfree SDK/API calls. Gateway events
 * must be verified server-side before a caller applies these transitions.
 */

export type PaymentOrderStatus =
  | "CREATED"
  | "CHECKOUT_READY"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "REVIEW_REQUIRED";

const ALLOWED_TRANSITIONS: Record<PaymentOrderStatus, readonly PaymentOrderStatus[]> = {
  CREATED: ["CHECKOUT_READY", "FAILED", "REVIEW_REQUIRED"],
  CHECKOUT_READY: ["PENDING", "PAID", "FAILED", "EXPIRED", "REVIEW_REQUIRED"],
  PENDING: ["PAID", "FAILED", "EXPIRED", "REVIEW_REQUIRED"],
  PAID: ["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REVIEW_REQUIRED"],
  FAILED: ["REVIEW_REQUIRED"],
  EXPIRED: ["REVIEW_REQUIRED"],
  REFUND_PENDING: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "REVIEW_REQUIRED"],
  PARTIALLY_REFUNDED: ["REFUND_PENDING", "REFUNDED", "REVIEW_REQUIRED"],
  REFUNDED: [],
  REVIEW_REQUIRED: ["PAID", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"],
};

export type PaymentTransitionResult =
  | { ok: true; status: PaymentOrderStatus; unchanged: boolean }
  | { ok: false; status: PaymentOrderStatus; error: string };

/**
 * Returns whether a transition is permitted. Repeated delivery of the same
 * status is considered a harmless no-op, which helps webhook handlers remain
 * idempotent after they have independently authenticated an event.
 */
export function transitionPaymentOrder(
  current: PaymentOrderStatus,
  next: PaymentOrderStatus,
): PaymentTransitionResult {
  if (current === next) {
    return { ok: true, status: current, unchanged: true };
  }

  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return {
      ok: false,
      status: current,
      error: "Payment order cannot move from " + current + " to " + next + ".",
    };
  }

  return { ok: true, status: next, unchanged: false };
}

export type PaymentSplit = {
  amountPaise: number;
  platformCommissionBps: number;
  platformSharePaise: number;
  providerSharePaise: number;
};

/**
 * Allocate an order-stage payment using a server-configured commission rate.
 *
 * BPS (basis points): 100 bps = 1%. The gateway's charges are not silently
 * deducted here; record and reconcile those separately under the merchant
 * agreement. Amounts are integer paise only—never floating-point rupees.
 */
export function calculatePaymentSplit(
  amountPaise: number,
  platformCommissionBps: number,
): PaymentSplit {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError("amountPaise must be a positive safe integer.");
  }

  if (
    !Number.isInteger(platformCommissionBps) ||
    platformCommissionBps < 0 ||
    platformCommissionBps > 9_999
  ) {
    throw new RangeError("platformCommissionBps must be an integer from 0 to 9999.");
  }

  // Integer half-up rounding, avoiding precision loss for larger rupee values.
  const amount = BigInt(amountPaise);
  const bps = BigInt(platformCommissionBps);
  const platformShare = (amount * bps + 5_000n) / 10_000n;
  const providerShare = amount - platformShare;

  return {
    amountPaise,
    platformCommissionBps,
    platformSharePaise: Number(platformShare),
    providerSharePaise: Number(providerShare),
  };
}
