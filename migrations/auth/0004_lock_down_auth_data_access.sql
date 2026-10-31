-- Lock down only Better Auth-owned tables from public/browser access.
-- Marketplace table grants and RLS are configured separately by the Fieldly
-- migration. Do not change permissions on unrelated public-schema tables.

revoke all privileges on table
  public."user",
  public."session",
  public."account",
  public."verification"
from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all privileges on table
          public."user", public."session", public."account", public."verification"
         from %I',
        role_name
      );
    end if;
  end loop;
end $$;

alter table public."user" enable row level security;
alter table public."session" enable row level security;
alter table public."account" enable row level security;
alter table public."verification" enable row level security;
