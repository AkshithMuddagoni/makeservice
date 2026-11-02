-- Pending signed-upload sessions bind a one-time storage path to the
-- authenticated provider, business, document requirement and optional asset,
-- service or operator. Final provider_documents rows are created only after
-- the server verifies size, magic bytes and a malware scan.
create table if not exists public.provider_document_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  business_id uuid not null references public.provider_businesses(id) on delete cascade,
  requirement_key text not null,
  provider_service_id uuid references public.provider_services(id) on delete restrict,
  asset_id uuid references public.provider_assets(id) on delete restrict,
  operator_id uuid references public.provider_operators(id) on delete restrict,
  storage_bucket text not null default 'fieldly-private'
    check (storage_bucket = 'fieldly-private'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending'
    check (status in ('pending','confirmed','expired','failed')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint provider_document_upload_scope_check
    check (
      (provider_service_id is not null)::integer +
      (asset_id is not null)::integer +
      (operator_id is not null)::integer <= 1
    )
);

create index if not exists provider_document_upload_sessions_owner_idx
  on public.provider_document_upload_sessions (user_id, status, expires_at);
create index if not exists provider_document_upload_sessions_business_idx
  on public.provider_document_upload_sessions (business_id, requirement_key, status);

alter table public.provider_document_upload_sessions enable row level security;
revoke all privileges on table public.provider_document_upload_sessions from public;

do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all privileges on table public.provider_document_upload_sessions from %I',
        role_name
      );
    end if;
  end loop;
end $$;
