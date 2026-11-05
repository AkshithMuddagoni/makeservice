import { createHash, randomBytes } from "node:crypto";

const OPERATOR_INVITATION_TOKEN_BYTES = 32;
const OPERATOR_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INDIA_E164_PATTERN = /^\+91[6-9]\d{9}$/;

/** Create an unguessable, URL-safe, single-use operator invitation token. */
export function createOperatorInvitationToken(): string {
  return randomBytes(OPERATOR_INVITATION_TOKEN_BYTES).toString("base64url");
}

/** Store only this digest; never persist the raw invitation token. */
export function hashOperatorInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Reject malformed tokens before any database lookup. */
export function isValidOperatorInvitationToken(token: string): boolean {
  return OPERATOR_INVITATION_TOKEN_PATTERN.test(token);
}

/** Invitation acceptance always depends on the authenticated, verified phone. */
export function canAcceptOperatorInvitation(input: {
  accountPhone: string | null;
  phoneVerified: boolean;
  invitedPhone: string;
  rosterPhone: string;
}): boolean {
  return Boolean(
    input.phoneVerified &&
    input.accountPhone &&
    INDIA_E164_PATTERN.test(input.accountPhone) &&
    input.accountPhone === input.invitedPhone &&
    input.accountPhone === input.rosterPhone,
  );
}
