-- MakeService / Fieldly production marketplace schema.
-- Identity source: Better Auth "user"."id" (TEXT), not Supabase Auth UUIDs.
-- This app-owned migration is kept in migrations/fieldly/ so Better Auth's
-- opt-in generated schema in migrations/auth/ remains untouched.
--
-- Private KYC files belong in a private Supabase Storage bucket. This schema
-- stores object metadata only; it does not store document bytes, PAN/Aadhaar,
-- full bank account numbers, card data, or raw OTPs.

do $$ begin
  create type fieldly_role as enum ('customer', 'provider', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_review_status as enum
    ('draft', 'submitted', 'under_review', 'needs_information', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_document_status as enum
    ('uploaded', 'under_review', 'verified', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_request_status as enum ('open', 'booked', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_quote_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_booking_status as enum
    ('confirmed', 'on_the_way', 'arrived', 'service_started', 'service_completed', 'paid', 'disputed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fieldly_payment_status as enum
    ('created', 'pending', 'authorized', 'captured', 'failed', 'partially_refunded', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists fieldly_profiles (
  user_id text primary key ,
  display_name text not null default '',
  locale text not null default 'en-IN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fieldly_user_roles (
  user_id text not null ,
  role fieldly_role not null,
  granted_by text ,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists provider_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null ,
  legal_name text not null,
  trading_name text not null,
  business_type text not null,
  address_line text not null,
  district text not null,
  city text,
  state text not null,
  pincode text not null,
  latitude double precision,
  longitude double precision,
  gst_status text not null default 'not_sure',
  udyam_provided boolean not null default false,
  verification_status fieldly_review_status not null default 'draft',
  reviewer_note text,
  reviewed_by text ,
  reviewed_at timestamptz,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (pincode ~ '^[0-9]{6}$')
);

create index if not exists provider_businesses_owner_idx
  on provider_businesses (owner_user_id, created_at desc);
create index if not exists provider_businesses_discovery_idx
  on provider_businesses (state, district, verification_status);

create table if not exists provider_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references provider_businesses (id) on delete cascade,
  service_id text not null,
  selected_tasks text[] not null default '{}',
  specifications jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  verification_status fieldly_review_status not null default 'draft',
  is_listed boolean not null default false,
  is_available boolean not null default false,
  reviewer_note text,
  reviewed_by text ,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, service_id),
  check (jsonb_typeof(specifications) = 'object'),
  check (jsonb_typeof(pricing) = 'object')
);

create index if not exists provider_services_discovery_idx
  on provider_services (service_id, verification_status, is_listed, is_available);

create table if not exists provider_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references provider_businesses (id) on delete cascade,
  asset_type text not null,
  make text not null,
  model text not null,
  year_of_manufacture smallint,
  ownership text not null check (ownership in ('owned', 'leased', 'third_party')),
  road_use text not null check
    (road_use in ('public_road', 'commercial_transport', 'trailer_moved', 'off_road', 'stationary', 'needs_review')),
  vehicle_class text,
  registration_last4 text,
  serial_last4 text,
  specifications jsonb not null default '{}'::jsonb,
  verification_status fieldly_review_status not null default 'draft',
  is_available boolean not null default false,
  reviewer_note text,
  reviewed_by text ,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (year_of_manufacture is null or year_of_manufacture between 1950 and 2100),
  check (registration_last4 is null or registration_last4 ~ '^[A-Z0-9]{4}$'),
  check (serial_last4 is null or serial_last4 ~ '^[A-Z0-9]{4}$'),
  check (jsonb_typeof(specifications) = 'object')
);

create index if not exists provider_assets_business_idx
  on provider_assets (business_id, verification_status);

create table if not exists provider_asset_services (
  asset_id uuid not null references provider_assets (id) on delete cascade,
  provider_service_id uuid not null references provider_services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (asset_id, provider_service_id)
);

create table if not exists provider_operators (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references provider_businesses (id) on delete cascade,
  linked_user_id text ,
  full_name text not null,
  phone_e164 text,
  role_title text not null,
  experience_years numeric(4,1),
  verification_status fieldly_review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (experience_years is null or experience_years between 0 and 80)
);

create index if not exists provider_operators_business_idx
  on provider_operators (business_id, verification_status);

create table if not exists provider_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references provider_businesses (id) on delete cascade,
  provider_service_id uuid references provider_services (id) on delete cascade,
  asset_id uuid references provider_assets (id) on delete cascade,
  operator_id uuid references provider_operators (id) on delete cascade,
  document_type text not null,
  storage_bucket text not null default 'fieldly-private',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256_hex text,
  status fieldly_document_status not null default 'uploaded',
  issued_on date,
  expires_on date,
  reviewer_note text,
  reviewed_by text ,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (size_bytes > 0),
  check (num_nonnulls(provider_service_id, asset_id, operator_id) <= 1)
);

create index if not exists provider_documents_review_idx
  on provider_documents (business_id, status, expires_on);

create table if not exists provider_presence (
  business_id uuid primary key references provider_businesses (id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists job_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id text not null ,
  service_id text not null,
  status fieldly_request_status not null default 'open',
  site_label text not null,
  site_address text not null,
  area text,
  city text not null,
  district text,
  state text not null,
  pincode text,
  landmark text,
  latitude double precision not null,
  longitude double precision not null,
  scheduled_for timestamptz,
  scheduling_note text not null default '',
  requirements jsonb not null default '{}'::jsonb,
  customer_notes text not null default '',
  details_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180),
  check (jsonb_typeof(requirements) = 'object')
);

create index if not exists job_requests_customer_idx
  on job_requests (customer_user_id, created_at desc);
create index if not exists job_requests_open_service_idx
  on job_requests (service_id, status, created_at desc);

create table if not exists job_request_targets (
  request_id uuid not null references job_requests (id) on delete cascade,
  business_id uuid not null references provider_businesses (id) on delete restrict,
  provider_service_id uuid references provider_services (id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'viewed', 'quoted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  primary key (request_id, business_id)
);

create table if not exists provider_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references job_requests (id) on delete cascade,
  business_id uuid not null references provider_businesses (id) on delete restrict,
  amount_paise bigint not null,
  currency char(3) not null default 'INR',
  note text not null,
  inclusions jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  extra_charges jsonb not null default '[]'::jsonb,
  cancellation_terms text not null default '',
  eta_minutes integer,
  status fieldly_quote_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, business_id),
  check (amount_paise > 0),
  check (eta_minutes is null or eta_minutes >= 0),
  check (jsonb_typeof(inclusions) = 'array'),
  check (jsonb_typeof(exclusions) = 'array'),
  check (jsonb_typeof(extra_charges) = 'array')
);

create index if not exists provider_quotes_request_idx
  on provider_quotes (request_id, status, created_at desc);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  request_id uuid not null unique references job_requests (id) on delete restrict,
  quote_id uuid not null unique references provider_quotes (id) on delete restrict,
  customer_user_id text not null ,
  business_id uuid not null references provider_businesses (id) on delete restrict,
  provider_service_id uuid references provider_services (id) on delete set null,
  assigned_asset_id uuid references provider_assets (id) on delete set null,
  assigned_operator_id uuid references provider_operators (id) on delete set null,
  service_id text not null,
  status fieldly_booking_status not null default 'confirmed',
  amount_paise bigint not null,
  currency char(3) not null default 'INR',
  scheduled_for timestamptz,
  site_snapshot jsonb not null,
  requirements_snapshot jsonb not null default '{}'::jsonb,
  terms_snapshot jsonb not null default '{}'::jsonb,
  start_code_hash text,
  start_code_expires_at timestamptz,
  start_code_attempts smallint not null default 0,
  start_code_consumed_at timestamptz,
  dispute_reason text,
  cancellation_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_paise > 0),
  check (start_code_attempts between 0 and 10),
  check (jsonb_typeof(site_snapshot) = 'object'),
  check (jsonb_typeof(requirements_snapshot) = 'object'),
  check (jsonb_typeof(terms_snapshot) = 'object')
);

create index if not exists bookings_customer_idx
  on bookings (customer_user_id, created_at desc);
create index if not exists bookings_provider_idx
  on bookings (business_id, created_at desc);
create index if not exists bookings_status_idx
  on bookings (status, scheduled_for);

create table if not exists booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  actor_user_id text ,
  from_status fieldly_booking_status,
  to_status fieldly_booking_status not null,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists booking_events_booking_idx
  on booking_events (booking_id, created_at);

create table if not exists booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  sender_user_id text not null ,
  message_text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (length(message_text) between 1 and 4000)
);

create index if not exists booking_messages_timeline_idx
  on booking_messages (booking_id, created_at);

create table if not exists booking_live_locations (
  booking_id uuid primary key references bookings (id) on delete cascade,
  business_id uuid not null references provider_businesses (id) on delete cascade,
  operator_id uuid references provider_operators (id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters numeric(8,2),
  heading_degrees numeric(6,2),
  speed_mps numeric(8,2),
  recorded_at timestamptz not null,
  expires_at timestamptz not null,
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);

create index if not exists booking_live_locations_expiry_idx
  on booking_live_locations (expires_at);

create table if not exists payment_intents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete restrict,
  gateway text not null check (gateway in ('cashfree', 'razorpay')),
  gateway_order_id text not null,
  gateway_payment_id text,
  amount_paise bigint not null,
  currency char(3) not null default 'INR',
  status fieldly_payment_status not null default 'created',
  idempotency_key text not null unique,
  gateway_signature_verified_at timestamptz,
  captured_at timestamptz,
  refunded_amount_paise bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gateway, gateway_order_id),
  check (amount_paise > 0),
  check (refunded_amount_paise between 0 and amount_paise)
);

create index if not exists payment_intents_booking_idx
  on payment_intents (booking_id, created_at desc);

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null check (gateway in ('cashfree', 'razorpay')),
  gateway_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  signature_verified_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (gateway, gateway_event_id),
  check (jsonb_typeof(payload) = 'object')
);

create table if not exists provider_payout_profiles (
  business_id uuid primary key references provider_businesses (id) on delete cascade,
  gateway text check (gateway in ('cashfree', 'razorpay')),
  gateway_vendor_id text,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'kyc_required', 'under_review', 'active', 'rejected', 'on_hold')),
  masked_destination text,
  last_four text,
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists provider_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings (id) on delete restrict,
  customer_user_id text not null ,
  business_id uuid not null references provider_businesses (id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '',
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists provider_reviews_business_idx
  on provider_reviews (business_id, is_visible, created_at desc);

create table if not exists fieldly_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_user_id text not null ,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

-- This schema is accessed through authenticated server functions only.
-- Do not expose the database password/service role to browser code. Public
-- provider discovery must select explicit non-sensitive columns; provider
-- documents, exact operator contacts and customer site details are never public.
