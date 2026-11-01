-- The application uses trusted server-side PostgreSQL connections and does
-- not expose its custom migration ledger through the Supabase Data API.
-- Keep the ledger inaccessible to browser roles and protected by RLS.
create table if not exists public._migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

alter table public._migrations enable row level security;
revoke all privileges on table public._migrations from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all privileges on table public._migrations from %I', role_name);
    end if;
  end loop;
end $$;
