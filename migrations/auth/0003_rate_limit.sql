-- Better Auth rateLimit model used for persistent OTP abuse controls.
-- Storage is configured as "database" in src/lib/auth/server.ts.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- This table is accessed only by the server-side Better Auth database role.
-- Revoke default public/browser privileges explicitly; RLS is a second layer.
revoke all privileges on table "rateLimit" from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all privileges on table "rateLimit" from %I', role_name);
    end if;
  end loop;
end $$;

alter table "rateLimit" enable row level security;
