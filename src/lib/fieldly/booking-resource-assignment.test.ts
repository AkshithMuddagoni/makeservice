import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_RESOURCE_RESERVED_STATUSES,
  CLOSED_DISPUTE_STATUSES,
  isBookingResourceReserved,
} from "./booking-resource-assignment.ts";

test("confirmed, travelling, arrived and working bookings reserve resources", () => {
  for (const status of ["confirmed", "on_the_way", "arrived", "service_started"]) {
    assert.equal(isBookingResourceReserved(status), true, status + " should reserve its asset and operator");
  }
});

test("open and in-review disputes reserve resources", () => {
  for (const status of ["open", "under_review", "awaiting_customer", "awaiting_provider"]) {
    assert.equal(isBookingResourceReserved("disputed", status), true, status + " dispute should reserve its asset and operator");
  }
  assert.equal(isBookingResourceReserved("disputed"), true, "a disputed booking without a dispute status must fail closed");
});

test("terminal disputes release resources even though booking status remains disputed", () => {
  for (const status of CLOSED_DISPUTE_STATUSES) {
    assert.equal(isBookingResourceReserved("disputed", status), false, status + " dispute should release its asset and operator");
  }
});

test("completed, paid and cancelled bookings release resources", () => {
  for (const status of ["service_completed", "paid", "cancelled"]) {
    assert.equal(isBookingResourceReserved(status), false, status + " should release its asset and operator");
  }
});

test("reservation states are unique and exclude disputed, which has its own lifecycle", () => {
  assert.equal(new Set(BOOKING_RESOURCE_RESERVED_STATUSES).size, BOOKING_RESOURCE_RESERVED_STATUSES.length);
  assert.deepEqual(BOOKING_RESOURCE_RESERVED_STATUSES, [
    "confirmed",
    "on_the_way",
    "arrived",
    "service_started",
  ]);
});
