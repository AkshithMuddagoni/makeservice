-- Secure operator-to-machine assignments. Composite foreign keys prevent
-- attaching an operator to a machine owned by a different provider business.
alter table public.provider_operators
  add column if not exists reviewer_note text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create unique index if not exists provider_operators_id_business_uidx
  on public.provider_operators (id, business_id);
create unique index if not exists provider_assets_id_business_uidx
  on public.provider_assets (id, business_id);

create table if not exists public.provider_operator_assets (
  business_id uuid not null references public.provider_businesses(id) on delete cascade,
  operator_id uuid not null,
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (operator_id, asset_id),
  constraint provider_operator_assets_operator_business_fk
    foreign key (operator_id, business_id)
    references public.provider_operators(id, business_id) on delete cascade,
  constraint provider_operator_assets_asset_business_fk
    foreign key (asset_id, business_id)
    references public.provider_assets(id, business_id) on delete cascade
);

create index if not exists provider_operator_assets_asset_idx
  on public.provider_operator_assets (business_id, asset_id);
create index if not exists provider_operator_assets_business_idx
  on public.provider_operator_assets (business_id, operator_id);

alter table public.provider_operator_assets enable row level security;
revoke all privileges on table public.provider_operator_assets from public;

do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all privileges on table public.provider_operator_assets from %I',
        role_name
      );
    end if;
  end loop;
end $$;
