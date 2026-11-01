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


test("service and asset approvals require an approved parent business", () => {
  assert.throws(
    () => assertAdminItemReviewAllowed({
      currentStatus: "under_review",
      decision: "approved",
      businessStatus: "under_review",
      pendingRequiredDocuments: 0,
    }),
    /parent provider business/,
  );
});

test("service approval requires an approved linked machine", () => {
  assert.throws(
    () => assertAdminItemReviewAllowed({
      currentStatus: "submitted",
      decision: "approved",
      businessStatus: "approved",
      pendingRequiredDocuments: 0,
      approvedLinkedAssets: 0,
      requiresApprovedAsset: true,
    }),
    /linked machine/,
  );
});

test("item approval requires all scoped required documents verified", () => {
  assert.throws(
    () => assertAdminItemReviewAllowed({
      currentStatus: "submitted",
      decision: "approved",
      businessStatus: "approved",
      pendingRequiredDocuments: 2,
    }),
    /item documents/,
  );
  assert.doesNotThrow(() =>
    assertAdminItemReviewAllowed({
      currentStatus: "under_review",
      decision: "approved",
      businessStatus: "approved",
      pendingRequiredDocuments: 0,
      approvedLinkedAssets: 1,
      requiresApprovedAsset: true,
    }),
  );
});

test("item review terminal states cannot be reopened", () => {
  assert.throws(
    () => assertAdminItemReviewAllowed({
      currentStatus: "approved",
      decision: "rejected",
      businessStatus: "approved",
      pendingRequiredDocuments: 0,
    }),
    /Cannot move/,
  );
  assert.doesNotThrow(() =>
    assertAdminItemReviewAllowed({
      currentStatus: "submitted",
      decision: "needs_information",
      businessStatus: "submitted",
      pendingRequiredDocuments: 4,
    }),
  );
});
