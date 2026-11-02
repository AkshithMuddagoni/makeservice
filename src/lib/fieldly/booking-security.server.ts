import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const START_CODE_PATTERN = /^\d{4}$/;

function requiredSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("Service-start verification is unavailable because the server secret is not configured.");
  }
  return secret;
}

/** Generate a cryptographically random four-digit customer start code. */
export function generateBookingStartCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

/** HMAC binds the short code to its booking so hashes cannot be replayed. */
export function hashBookingStartCode(bookingId: string, code: string): string {
  if (!START_CODE_PATTERN.test(code)) throw new Error("The start code must contain exactly four digits.");
  return createHmac("sha256", requiredSecret())
    .update("makeservice:booking-start-code:v1:")
    .update(bookingId)
    .update(":")
    .update(code)
    .digest("hex");
}

/** Constant-time comparison of a stored hex HMAC and a submitted code. */
export function verifyBookingStartCodeHash(
  bookingId: string,
  code: string,
  storedHash: string,
): boolean {
  if (!START_CODE_PATTERN.test(code) || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = Buffer.from(hashBookingStartCode(bookingId, code), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
