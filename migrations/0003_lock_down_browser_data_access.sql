-- Lock down all application and Better Auth tables from Supabase Data API roles.
-- On Supabase, anon/authenticated receive no table grants and no RLS policies.
-- The migration also runs in local PGLite, where those Supabase roles do not
-- exist; role-specific grants are guarded so preview schema bootstrap still works.
-- The trusted app backend connects with DATABASE_URL only (never browser code).

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'alter default privileges in schema public revoke all on tables from %I',
        role_name
      );
      execute format(
        'alter default privileges in schema public revoke all on sequences from %I',
        role_name
      );
      execute format(
        'alter default privileges in schema public revoke execute on functions from %I',
        role_name
      );
      execute format(
        'revoke all privileges on all tables in schema public from %I',
        role_name
      );
      execute format(
        'revoke all privileges on all sequences in schema public from %I',
        role_name
      );
      execute format(
        'revoke execute on all functions in schema public from %I',
        role_name
      );
    end if;
  end loop;
end $$;

alter table "user" enable row level security;
alter table "session" enable row level security;
alter table "account" enable row level security;
alter table "verification" enable row level security;

alter table fieldly_profiles enable row level security;
alter table fieldly_user_roles enable row level security;
alter table provider_businesses enable row level security;
alter table provider_services enable row level security;
alter table provider_assets enable row level security;
alter table provider_asset_services enable row level security;
alter table provider_operators enable row level security;
alter table provider_documents enable row level security;
alter table provider_presence enable row level security;
alter table job_requests enable row level security;
alter table job_request_targets enable row level security;
alter table provider_quotes enable row level security;
alter table bookings enable row level security;
alter table booking_events enable row level security;
alter table booking_messages enable row level security;
alter table booking_live_locations enable row level security;
alter table payment_intents enable row level security;
alter table payment_webhook_events enable row level security;
alter table provider_payout_profiles enable row level security;
alter table provider_reviews enable row level security;
alter table fieldly_admin_audit enable row level security;
