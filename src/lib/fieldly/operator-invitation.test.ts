import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptOperatorInvitation,
  createOperatorInvitationToken,
  hashOperatorInvitationToken,
  isValidOperatorInvitationToken,
} from "./operator-invitation.ts";

test("operator invitations use high-entropy URL-safe tokens and one-way hashes", () => {
  const first = createOperatorInvitationToken();
  const second = createOperatorInvitationToken();

  assert.equal(first.length, 43);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(isValidOperatorInvitationToken(first), true);
  assert.equal(isValidOperatorInvitationToken("482609"), false);
  assert.equal(hashOperatorInvitationToken(first), hashOperatorInvitationToken(first));
  assert.notEqual(hashOperatorInvitationToken(first), first);
  assert.notEqual(hashOperatorInvitationToken(first), hashOperatorInvitationToken(second));
});

test("operator invitations require exact matching verified Indian mobile numbers", () => {
  const phone = "+919876543210";
  const valid = {
    accountPhone: phone,
    phoneVerified: true,
    invitedPhone: phone,
    rosterPhone: phone,
  };

  assert.equal(canAcceptOperatorInvitation(valid), true);
  assert.equal(canAcceptOperatorInvitation({ ...valid, phoneVerified: false }), false);
  assert.equal(canAcceptOperatorInvitation({ ...valid, accountPhone: "+919876543211" }), false);
  assert.equal(canAcceptOperatorInvitation({ ...valid, invitedPhone: "+919876543211" }), false);
  assert.equal(canAcceptOperatorInvitation({ ...valid, rosterPhone: "+919876543211" }), false);
  assert.equal(canAcceptOperatorInvitation({ ...valid, accountPhone: null }), false);
  assert.equal(canAcceptOperatorInvitation({ ...valid, accountPhone: "9876543210" }), false);
});
