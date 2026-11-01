import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidIndiaE164Phone,
  isValidIndiaMobileNumber,
  isValidIndiaPincode,
} from "./india-validation.ts";

test("accepts six-digit Indian PIN codes and rejects malformed values", () => {
  for (const value of ["500001", "506003", "110001", "799001"]) {
    assert.equal(isValidIndiaPincode(value), true, value);
  }
  for (const value of ["50001", "5000010", "50A001", "500 01", "", "123456\n"]) {
    assert.equal(isValidIndiaPincode(value), false, JSON.stringify(value));
  }
});

test("accepts valid Indian national mobile numbers only", () => {
  assert.equal(isValidIndiaMobileNumber("9876543210"), true);
  assert.equal(isValidIndiaMobileNumber("6123456789"), true);
  for (const value of ["5123456789", "1234567890", "987654321", "98765432100", "+919876543210"]) {
    assert.equal(isValidIndiaMobileNumber(value), false, value);
  }
});

test("accepts valid Indian E.164 mobile numbers only", () => {
  assert.equal(isValidIndiaE164Phone("+919876543210"), true);
  assert.equal(isValidIndiaE164Phone("+916123456789"), true);
  for (const value of ["9876543210", "+911234567890", "+14155552671", "+91987654321", "+9198765432100"]) {
    assert.equal(isValidIndiaE164Phone(value), false, value);
  }
});
