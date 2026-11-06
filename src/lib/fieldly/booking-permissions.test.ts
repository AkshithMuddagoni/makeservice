import assert from "node:assert/strict";
import { test } from "node:test";
import { canViewBookingDetail } from "./booking-permissions.ts";

test("customer can view their booking detail", () => {
  assert.equal(canViewBookingDetail({ isCustomer: true, isProvider: false, isAssignedOperator: false }), true);
});

test("provider owner can view their booking detail", () => {
  assert.equal(canViewBookingDetail({ isCustomer: false, isProvider: true, isAssignedOperator: false }), true);
});

test("approved assigned operator can view the booking authorized by the server", () => {
  assert.equal(canViewBookingDetail({ isCustomer: false, isProvider: false, isAssignedOperator: true }), true);
});

test("unrelated authenticated users cannot view a booking detail", () => {
  assert.equal(canViewBookingDetail({ isCustomer: false, isProvider: false, isAssignedOperator: false }), false);
});
