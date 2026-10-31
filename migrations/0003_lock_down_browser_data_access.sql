-- Lock down all application and Better Auth tables from Supabase Data API roles.
-- MakeService uses the server-only DATABASE_URL through src/lib/db.ts. Browser
-- clients must never query these tables using anon/authenticated credentials.
-- No RLS policies are intentionally added: anon/authenticated access is denied.
-- The database owner used by the trusted backend continues to manage migrations.

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

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
