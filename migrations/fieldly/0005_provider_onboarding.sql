-- Provider onboarding production fields and ownership integrity.
-- The first marketplace schema intentionally kept user IDs as TEXT without
-- foreign keys so the Fieldly-only preview schema test could run separately.
-- This migration runs after the Better Auth schema is available.

alter table public.fieldly_profiles
  add constraint fieldly_profiles_user_fk
  foreign key (user_id) references public."user" ("id") on delete cascade;

alter table public.fieldly_user_roles
  add constraint fieldly_user_roles_user_fk
  foreign key (user_id) references public."user" ("id") on delete cascade;

alter table public.fieldly_user_roles
  add constraint fieldly_user_roles_granted_by_fk
  foreign key (granted_by) references public."user" ("id") on delete set null;

alter table public.provider_businesses
  add column if not exists owner_full_name text not null default '',
  add column if not exists aggregate_turnover_band text not null default 'NOT_SURE',
  add column if not exists authorised_representative boolean not null default false,
  add column if not exists declaration_accepted_at timestamptz,
  add column if not exists years_experience smallint not null default 0,
  add column if not exists languages text[] not null default '{}',
  add column if not exists bio text not null default '',
  add column if not exists area text not null default '';

alter table public.provider_businesses
  add constraint provider_businesses_owner_fk
  foreign key (owner_user_id) references public."user" ("id") on delete restrict;

alter table public.provider_businesses
  add constraint provider_businesses_reviewed_by_fk
  foreign key (reviewed_by) references public."user" ("id") on delete set null;

alter table public.provider_services
  add constraint provider_services_reviewed_by_fk
  foreign key (reviewed_by) references public."user" ("id") on delete set null;

alter table public.provider_assets
  add constraint provider_assets_reviewed_by_fk
  foreign key (reviewed_by) references public."user" ("id") on delete set null;

alter table public.provider_operators
  add constraint provider_operators_linked_user_fk
  foreign key (linked_user_id) references public."user" ("id") on delete set null;

alter table public.provider_documents
  add constraint provider_documents_reviewed_by_fk
  foreign key (reviewed_by) references public."user" ("id") on delete set null;

alter table public.job_requests
  add constraint job_requests_customer_fk
  foreign key (customer_user_id) references public."user" ("id") on delete restrict;

alter table public.bookings
  add constraint bookings_customer_fk
  foreign key (customer_user_id) references public."user" ("id") on delete restrict;

alter table public.booking_events
  add constraint booking_events_actor_fk
  foreign key (actor_user_id) references public."user" ("id") on delete set null;

alter table public.booking_messages
  add constraint booking_messages_sender_fk
  foreign key (sender_user_id) references public."user" ("id") on delete restrict;

alter table public.fieldly_admin_audit
  add constraint fieldly_admin_audit_admin_fk
  foreign key (admin_user_id) references public."user" ("id") on delete restrict;

create index if not exists provider_businesses_owner_lookup_idx
  on public.provider_businesses (owner_user_id, created_at desc);

create unique index if not exists provider_businesses_owner_legal_unique
  on public.provider_businesses (owner_user_id, lower(trim(legal_name)))
  where is_suspended = false;

create table if not exists public.provider_document_requirements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.provider_businesses (id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text not null default '',
  required_for_approval boolean not null default false,
  secure_only boolean not null default false,
  job_specific boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'under_review', 'verified', 'rejected', 'not_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, requirement_key)
);

create index if not exists provider_document_requirements_review_idx
  on public.provider_document_requirements (business_id, status, required_for_approval);

alter table public.provider_document_requirements enable row level security;

revoke all privileges on table public.provider_document_requirements from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all privileges on table public.provider_document_requirements from %I',
        role_name
      );
    end if;
  end loop;
end $$;
