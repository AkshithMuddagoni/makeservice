import { getSql } from "../db";
import {
  canAcceptOperatorInvitation,
  createOperatorInvitationToken,
  hashOperatorInvitationToken,
  isValidOperatorInvitationToken,
} from "./operator-invitation";

const OPERATOR_INVITATION_TTL_HOURS = 72;
const MAX_OPERATOR_INVITATIONS_PER_HOUR = 5;
const INDIA_E164_PATTERN = /^\\+91[6-9]\\d{9}$/;

function assertAuthenticatedIdentity(userId: string): void {
  if (!userId || userId === "dev-user") {
    throw new Error("A verified account is required for operator account linking.");
  }
}

/**
 * Provider owners create one-time invitations for a roster mobile number.
 * The plaintext token is returned only once and must never be persisted.
 */
export async function createProviderOperatorInvitationForUser(
  userId: string,
  operatorId: string,
): Promise<{ token: string; expiresAt: string; operatorName: string; businessName: string }> {
  assertAuthenticatedIdentity(userId);
  const sql = await getSql();

  return sql.transaction(async (tx) => {
    const roles = await tx.query<{ role: string }>(
      "select role::text as role from public.fieldly_user_roles where user_id = $1 and role = 'provider' limit 1",
      [userId],
    );
    if (!roles[0]) throw new Error("Only an approved provider account can invite an operator.");

    const rows = await tx.query<{
      operator_id: string;
      operator_name: string;
      operator_phone: string | null;
      operator_status: string;
      linked_user_id: string | null;
      business_id: string;
      business_name: string;
      business_status: string;
    }>(
      `select po.id::text as operator_id, po.full_name as operator_name,
              po.phone_e164 as operator_phone, po.verification_status::text as operator_status,
              po.linked_user_id, pb.id::text as business_id,
              pb.trading_name as business_name,
              pb.verification_status::text as business_status
       from public.provider_operators po
       join public.provider_businesses pb on pb.id = po.business_id
       where po.id = $1::uuid and pb.owner_user_id = $2 and pb.is_suspended = false
       for update of po, pb`,
      [operatorId, userId],
    );
    const operator = rows[0];
    if (!operator) throw new Error("This operator is not part of a business owned by your account.");
    if (operator.business_status !== "approved" || operator.operator_status !== "approved") {
      throw new Error("The business and operator must both be approved before the operator can activate an account.");
    }
    if (!operator.operator_phone || !INDIA_E164_PATTERN.test(operator.operator_phone)) {
      throw new Error("Add a valid Indian mobile number to this operator's roster before sending an invitation.");
    }
    if (operator.linked_user_id) {
      throw new Error("This operator is already linked to an account. Contact support to change the linked identity.");
    }

    const recent = await tx.query<{ invitation_count: number }>(
      `select count(*)::int as invitation_count
       from public.provider_operator_invites
       where operator_id = $1::uuid and created_at > now() - interval '1 hour'`,
      [operatorId],
    );
    if ((recent[0]?.invitation_count ?? 0) >= MAX_OPERATOR_INVITATIONS_PER_HOUR) {
      throw new Error("Too many invitations were created for this operator. Try again later.");
    }

    // Revoke the previous invitation (including an expired one) before creating
    // a fresh token. This is serialized by the operator row lock above.
    await tx.query(
      `update public.provider_operator_invites
       set revoked_at = now()
       where operator_id = $1::uuid and accepted_at is null and revoked_at is null`,
      [operatorId],
    );

    const token = createOperatorInvitationToken();
    const tokenHash = hashOperatorInvitationToken(token);
    const invitations = await tx.query<{ expires_at: string }>(
      `insert into public.provider_operator_invites
         (business_id, operator_id, invited_phone_e164, token_hash, created_by_user_id, expires_at)
       values ($1::uuid, $2::uuid, $3, $4, $5, now() + ($6::int * interval '1 hour'))
       returning expires_at::text as expires_at`,
      [operator.business_id, operatorId, operator.operator_phone, tokenHash, userId, OPERATOR_INVITATION_TTL_HOURS],
    );
    const expiresAt = invitations[0]?.expires_at;
    if (!expiresAt) throw new Error("The operator invitation could not be created.");

    return {
      token,
      expiresAt,
      operatorName: operator.operator_name,
      businessName: operator.business_name,
    };
  });
}

/**
 * Redeem an invitation only after the current Better Auth session proves
 * possession of the exact phone number stored on the provider's roster.
 */
export async function acceptProviderOperatorInvitationForUser(input: {
  userId: string;
  accountPhone: string | null;
  phoneVerified: boolean;
  token: string;
}): Promise<{ operatorId: string; operatorName: string; businessName: string }> {
  assertAuthenticatedIdentity(input.userId);
  if (!isValidOperatorInvitationToken(input.token)) {
    throw new Error("This operator invitation is invalid or has expired.");
  }
  if (!input.phoneVerified || !input.accountPhone || !INDIA_E164_PATTERN.test(input.accountPhone)) {
    throw new Error("Verify your Indian mobile number with MakeService before accepting this operator invitation.");
  }

  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const rows = await tx.query<{
      invitation_id: string;
      invited_phone: string;
      operator_id: string;
      operator_phone: string | null;
      operator_name: string;
      operator_status: string;
      linked_user_id: string | null;
      business_name: string;
      business_status: string;
      is_suspended: boolean;
    }>(
      `select poi.id::text as invitation_id, poi.invited_phone_e164 as invited_phone,
              po.id::text as operator_id, po.phone_e164 as operator_phone,
              po.full_name as operator_name, po.verification_status::text as operator_status,
              po.linked_user_id, pb.trading_name as business_name,
              pb.verification_status::text as business_status, pb.is_suspended
       from public.provider_operator_invites poi
       join public.provider_operators po
         on po.id = poi.operator_id and po.business_id = poi.business_id
       join public.provider_businesses pb on pb.id = poi.business_id
       where poi.token_hash = $1
         and poi.accepted_at is null
         and poi.revoked_at is null
         and poi.expires_at > now()
       for update of poi, po, pb`,
      [hashOperatorInvitationToken(input.token)],
    );
    const invitation = rows[0];
    if (!invitation) throw new Error("This operator invitation is invalid, expired, revoked or already used.");
    if (
      invitation.is_suspended ||
      invitation.business_status !== "approved" ||
      invitation.operator_status !== "approved"
    ) {
      throw new Error("This provider business or operator is no longer approved for live operations.");
    }
    if (invitation.linked_user_id) {
      throw new Error("This operator has already been linked to an account.");
    }
    if (!canAcceptOperatorInvitation({
      accountPhone: input.accountPhone,
      phoneVerified: input.phoneVerified,
      invitedPhone: invitation.invited_phone,
      rosterPhone: invitation.operator_phone ?? "",
    })) {
      throw new Error("Use the verified mobile number that the provider registered for this operator.");
    }

    const linked = await tx.query<{ id: string }>(
      `update public.provider_operators
       set linked_user_id = $2, updated_at = now()
       where id = $1::uuid and linked_user_id is null
       returning id::text as id`,
      [invitation.operator_id, input.userId],
    );
    if (!linked[0]) throw new Error("This operator account was linked by another session. Request a new invitation if needed.");

    const consumed = await tx.query<{ id: string }>(
      `update public.provider_operator_invites
       set accepted_by_user_id = $2, accepted_at = now()
       where id = $1::uuid and accepted_at is null and revoked_at is null and expires_at > now()
       returning id::text as id`,
      [invitation.invitation_id, input.userId],
    );
    if (!consumed[0]) throw new Error("This invitation could not be redeemed. Request a new invitation from the provider.");

    return {
      operatorId: invitation.operator_id,
      operatorName: invitation.operator_name,
      businessName: invitation.business_name,
    };
  });
}
