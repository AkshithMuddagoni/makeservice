import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePaymentSplit,
  transitionPaymentOrder,
} from "./state.ts";

test("payment order state accepts the normal collection path", () => {
  assert.deepEqual(transitionPaymentOrder("CREATED", "CHECKOUT_READY"), {
    ok: true,
    status: "CHECKOUT_READY",
    unchanged: false,
  });
  assert.deepEqual(transitionPaymentOrder("CHECKOUT_READY", "PENDING"), {
    ok: true,
    status: "PENDING",
    unchanged: false,
  });
  assert.deepEqual(transitionPaymentOrder("PENDING", "PAID"), {
    ok: true,
    status: "PAID",
    unchanged: false,
  });
});

test("duplicate payment status is an idempotent no-op", () => {
  assert.deepEqual(transitionPaymentOrder("PAID", "PAID"), {
    ok: true,
    status: "PAID",
    unchanged: true,
  });
});

test("payment state rejects skipping to paid from an unverified created order", () => {
  const result = transitionPaymentOrder("CREATED", "PAID");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "CREATED");
    assert.match(result.error, /cannot move from CREATED to PAID/);
  }
});

test("paid orders can move through partial and final refund states", () => {
  assert.equal(transitionPaymentOrder("PAID", "PARTIALLY_REFUNDED").ok, true);
  assert.equal(transitionPaymentOrder("PARTIALLY_REFUNDED", "REFUND_PENDING").ok, true);
  assert.equal(transitionPaymentOrder("REFUND_PENDING", "REFUNDED").ok, true);
  assert.equal(transitionPaymentOrder("REFUNDED", "PAID").ok, false);
});

test("payment split uses paise and preserves exact total", () => {
  const split = calculatePaymentSplit(5_000_000, 500);
  assert.deepEqual(split, {
    amountPaise: 5_000_000,
    platformCommissionBps: 500,
    platformSharePaise: 250_000,
    providerSharePaise: 4_750_000,
  });
  assert.equal(split.platformSharePaise + split.providerSharePaise, split.amountPaise);
});

test("payment split rounds half-up and supports zero commission", () => {
  assert.deepEqual(calculatePaymentSplit(1, 5_000), {
    amountPaise: 1,
    platformCommissionBps: 5_000,
    platformSharePaise: 1,
    providerSharePaise: 0,
  });
  assert.equal(calculatePaymentSplit(10_000, 0).platformSharePaise, 0);
});

test("payment split rejects unsafe amount and invalid commission", () => {
  assert.throws(() => calculatePaymentSplit(0, 500), /positive safe integer/);
  assert.throws(() => calculatePaymentSplit(1.25, 500), /positive safe integer/);
  assert.throws(() => calculatePaymentSplit(Number.MAX_SAFE_INTEGER + 1, 500), /positive safe integer/);
  assert.throws(() => calculatePaymentSplit(100, -1), /integer from 0 to 9999/);
  assert.throws(() => calculatePaymentSplit(100, 10_000), /integer from 0 to 9999/);
});
