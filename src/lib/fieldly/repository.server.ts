import { DEV_USER_ID } from "../auth/verify.server";
import { getSql } from "../db";

export type FieldlyProfile = {
  user_id: string;
  display_name: string;
  locale: string;
  created_at: string;
  updated_at: string;
};

export type FieldlyRole = "customer" | "provider" | "admin";

export type FieldlyAccount = {
  profile: FieldlyProfile;
  roles: FieldlyRole[];
};

/**
 * User ids passed here must come from authMiddleware's verified request
 * context. Never call these repository methods with a browser-supplied id.
 * The shared preview/dev fallback is rejected even when authentication is
 * disabled, so demo identities cannot create production marketplace records.
 */
function assertProductionIdentity(userId: string): void {
  if (!userId || userId === DEV_USER_ID) {
    throw new Error("A real signed-in account is required for marketplace data.");
  }
}

/**
 * Create the Fieldly profile and default customer role for a verified user.
 * Better Auth remains the identity source; this stores only app-specific data.
 */
export async function ensureFieldlyAccountForUser(userId: string): Promise<FieldlyAccount> {
  assertProductionIdentity(userId);
  const sql = await getSql();

  const identities = await sql.query<{ name: string }>(
    'select "name" from "user" where "id" = $1 limit 1',
    [userId],
  );
  const identity = identities[0];
  if (!identity) {
    throw new Error("The authenticated identity was not found in the account database.");
  }

  const profiles = await sql.query<FieldlyProfile>(
    `insert into fieldly_profiles (user_id, display_name)
     values ($1, $2)
     on conflict (user_id) do update
       set display_name = case
         when fieldly_profiles.display_name = '' then excluded.display_name
         else fieldly_profiles.display_name
       end,
       updated_at = now()
     returning user_id, display_name, locale, created_at, updated_at`,
    [userId, identity.name ?? ""],
  );
  const profile = profiles[0];
  if (!profile) throw new Error("Could not create the Fieldly profile.");

  await sql.query(
    `insert into fieldly_user_roles (user_id, role)
     values ($1, 'customer')
     on conflict (user_id, role) do nothing`,
    [userId],
  );

  const roleRows = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from fieldly_user_roles where user_id = $1 order by role",
    [userId],
  );

  return { profile, roles: roleRows.map((row) => row.role) };
}

/** Read only the supplied verified user's profile and roles. */
export async function getFieldlyAccountForUser(userId: string): Promise<FieldlyAccount | null> {
  assertProductionIdentity(userId);
  const sql = await getSql();

  const profiles = await sql.query<FieldlyProfile>(
    `select user_id, display_name, locale, created_at, updated_at
     from fieldly_profiles where user_id = $1 limit 1`,
    [userId],
  );
  const profile = profiles[0];
  if (!profile) return null;

  const roleRows = await sql.query<{ role: FieldlyRole }>(
    "select role::text as role from fieldly_user_roles where user_id = $1 order by role",
    [userId],
  );

  return { profile, roles: roleRows.map((row) => row.role) };
}
