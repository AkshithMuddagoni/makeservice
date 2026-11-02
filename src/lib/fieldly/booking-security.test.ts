import assert from "node:assert/strict";
import testCase from "node:test";
import {
  generateBookingStartCode,
  hashBookingStartCode,
  verifyBookingStartCodeHash,
} from "./booking-security.server.ts";

testCase("service-start code is always four numeric digits", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateBookingStartCode(), /^\d{4}$/);
  }
});

testCase("start code hashes are bound to a booking and can be verified", () => {
  process.env.BETTER_AUTH_SECRET = "test-only-secret-for-booking-code";
  const bookingA = "10000000-0000-4000-8000-000000000001";
  const bookingB = "10000000-0000-4000-8000-000000000002";
  const code = "0427";
  const hash = hashBookingStartCode(bookingA, code);
  assert.equal(verifyBookingStartCodeHash(bookingA, code, hash), true);
  assert.equal(verifyBookingStartCodeHash(bookingA, "0428", hash), false);
  assert.equal(verifyBookingStartCodeHash(bookingB, code, hash), false);
  assert.equal(verifyBookingStartCodeHash(bookingA, "42", hash), false);
  assert.equal(verifyBookingStartCodeHash(bookingA, code, "not-a-hash"), false);
});

testCase("start-code hashing fails closed without a server secret", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  delete process.env.BETTER_AUTH_SECRET;
  try {
    assert.throws(() => hashBookingStartCode("booking-id", "1234"), /server secret is not configured/);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});
