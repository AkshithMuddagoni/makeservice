import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_RESOURCE_RESERVED_STATUSES,
  isBookingResourceReserved,
} from "./booking-resource-assignment.ts";

test("confirmed, travelling, arrived, working and disputed bookings reserve resources", () => {
  for (const status of ["confirmed", "on_the_way", "arrived", "service_started", "disputed"]) {
    assert.equal(isBookingResourceReserved(status), true, status + " should reserve its asset and operator");
  }
});

test("completed, paid and cancelled bookings release resources", () => {
  for (const status of ["service_completed", "paid", "cancelled"]) {
    assert.equal(isBookingResourceReserved(status), false, status + " should release its asset and operator");
  }
});

test("reservation states are unique and do not include terminal completion", () => {
  assert.equal(new Set(BOOKING_RESOURCE_RESERVED_STATUSES).size, BOOKING_RESOURCE_RESERVED_STATUSES.length);
  assert.deepEqual(BOOKING_RESOURCE_RESERVED_STATUSES, [
    "confirmed",
    "on_the_way",
    "arrived",
    "service_started",
    "disputed",
  ]);
});
