-- Secure one-time identity linking for approved provider operators.
-- Invitation tokens are never stored in plaintext and can be redeemed only by
-- a signed-in Better Auth user whose verified phone matches the operator roster.

ALTER TABLE public.provider_operators
  ADD CONSTRAINT provider_operators_linked_user_fk
  FOREIGN KEY (linked_user_id)
  REFERENCES public."user" ("id")
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.provider_operators
  VALIDATE CONSTRAINT provider_operators_linked_user_fk;

CREATE UNIQUE INDEX IF NOT EXISTS provider_operators_linked_user_id_uidx
  ON public.provider_operators (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.provider_operator_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  invited_phone_e164 text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by_user_id text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT provider_operator_invites_operator_business_fk
    FOREIGN KEY (operator_id, business_id)
    REFERENCES public.provider_operators (id, business_id)
    ON DELETE CASCADE,
  CONSTRAINT provider_operator_invites_phone_check
    CHECK (invited_phone_e164 ~ '^\\+91[6-9][0-9]{9}$'),
  CONSTRAINT provider_operator_invites_token_hash_check
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT provider_operator_invites_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT provider_operator_invites_acceptance_pair_check
    CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL)),
  CONSTRAINT provider_operator_invites_not_accepted_and_revoked_check
    CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

-- At most one outstanding invitation is issued for an operator. The server
-- revokes the previous invitation in the same transaction before inserting.
CREATE UNIQUE INDEX IF NOT EXISTS provider_operator_invites_one_open_per_operator_uidx
  ON public.provider_operator_invites (operator_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS provider_operator_invites_expiry_idx
  ON public.provider_operator_invites (expires_at);

ALTER TABLE public.provider_operator_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.provider_operator_invites FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.provider_operator_invites FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.provider_operator_invites IS
  'Private, single-use operator account invitations. Only server-side application code can read or mutate invitation records.';
COMMENT ON COLUMN public.provider_operator_invites.token_hash IS
  'SHA-256 digest of a 256-bit base64url invitation token; the raw token is returned once to the provider owner.';
