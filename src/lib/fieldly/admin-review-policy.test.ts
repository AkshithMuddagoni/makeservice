import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAdminReviewDecisionAllowed,
  assertAdminReviewReason,
} from "./admin-review-policy.ts";

test("submitted provider applications can enter review or request information", () => {
  assert.doesNotThrow(() =>
    assertAdminReviewDecisionAllowed("submitted", "under_review", 4),
  );
  assert.doesNotThrow(() =>
    assertAdminReviewDecisionAllowed("submitted", "needs_information", 4),
  );
  assert.doesNotThrow(() =>
    assertAdminReviewDecisionAllowed("submitted", "rejected", 4),
  );
});

test("approval is blocked while any required document remains unverified", () => {
  assert.throws(
    () => assertAdminReviewDecisionAllowed("under_review", "approved", 1),
    /securely uploaded and verified/,
  );
  assert.doesNotThrow(() =>
    assertAdminReviewDecisionAllowed("under_review", "approved", 0),
  );
});

test("review transitions cannot reopen terminal business states", () => {
  assert.throws(
    () => assertAdminReviewDecisionAllowed("approved", "rejected", 0),
    /Cannot move/,
  );
  assert.throws(
    () => assertAdminReviewDecisionAllowed("rejected", "approved", 0),
    /Cannot move/,
  );
  assert.throws(
    () => assertAdminReviewDecisionAllowed("suspended", "under_review", 0),
    /Cannot move/,
  );
  assert.doesNotThrow(() =>
    assertAdminReviewDecisionAllowed("needs_information", "under_review", 2),
  );
});

test("information requests and rejection require a reason", () => {
  assert.throws(
    () => assertAdminReviewReason("needs_information", "no"),
    /at least 8 characters/,
  );
  assert.throws(
    () => assertAdminReviewReason("rejected", " "),
    /at least 8 characters/,
  );
  assert.doesNotThrow(() =>
    assertAdminReviewReason("needs_information", "Please provide current certificates."),
  );
  assert.doesNotThrow(() => assertAdminReviewReason("under_review", ""));
});
