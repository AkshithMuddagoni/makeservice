-- Lock down ONLY MakeService marketplace tables.
-- Better Auth table grants/RLS are handled by
-- migrations/auth/0004_lock_down_auth_data_access.sql.
-- Do not change privileges on unrelated tables in the public schema.

revoke all privileges on table
  public.fieldly_profiles,
  public.fieldly_user_roles,
  public.provider_businesses,
  public.provider_services,
  public.provider_assets,
  public.provider_asset_services,
  public.provider_operators,
  public.provider_documents,
  public.provider_presence,
  public.job_requests,
  public.job_request_targets,
  public.provider_quotes,
  public.bookings,
  public.booking_events,
  public.booking_messages,
  public.booking_live_locations,
  public.payment_intents,
  public.payment_webhook_events,
  public.provider_payout_profiles,
  public.provider_reviews,
  public.fieldly_admin_audit
from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all privileges on table
          public.fieldly_profiles, public.fieldly_user_roles,
          public.provider_businesses, public.provider_services,
          public.provider_assets, public.provider_asset_services,
          public.provider_operators, public.provider_documents,
          public.provider_presence, public.job_requests, public.job_request_targets,
          public.provider_quotes, public.bookings, public.booking_events,
          public.booking_messages, public.booking_live_locations,
          public.payment_intents, public.payment_webhook_events,
          public.provider_payout_profiles, public.provider_reviews,
          public.fieldly_admin_audit
         from %I',
        role_name
      );
    end if;
  end loop;
end $$;

-- RLS is defense in depth for any future grants. There are intentionally no
-- browser-facing policies; authenticated server operations use DATABASE_URL.
alter table public.fieldly_profiles enable row level security;
alter table public.fieldly_user_roles enable row level security;
alter table public.provider_businesses enable row level security;
alter table public.provider_services enable row level security;
alter table public.provider_assets enable row level security;
alter table public.provider_asset_services enable row level security;
alter table public.provider_operators enable row level security;
alter table public.provider_documents enable row level security;
alter table public.provider_presence enable row level security;
alter table public.job_requests enable row level security;
alter table public.job_request_targets enable row level security;
alter table public.provider_quotes enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_messages enable row level security;
alter table public.booking_live_locations enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.provider_payout_profiles enable row level security;
alter table public.provider_reviews enable row level security;
alter table public.fieldly_admin_audit enable row level security;
