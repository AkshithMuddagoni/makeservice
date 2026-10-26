-- Fieldly starter schema for Supabase PostgreSQL.
-- Review/test Row Level Security before using real customer data.
create extension if not exists pgcrypto;

create type public.profile_role as enum ('customer', 'provider', 'admin');
create type public.booking_status as enum ('requested', 'quoted', 'confirmed', 'on_the_way', 'arrived', 'service_started', 'completed', 'cancelled', 'disputed');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.profile_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null,
  description text not null default '',
  services text[] not null default '{}',
  equipment text,
  phone text,
  latitude double precision,
  longitude double precision,
  service_radius_km integer not null default 30 check (service_radius_km > 0),
  base_price numeric(12,2),
  is_online boolean not null default false,
  is_verified boolean not null default false,
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  provider_id uuid references public.providers(id),
  service_id text not null,
  status public.booking_status not null default 'requested',
  site_label text not null,
  site_address text not null,
  latitude double precision,
  longitude double precision,
  scheduled_for timestamptz,
  requirements jsonb not null default '{}'::jsonb,
  customer_notes text not null default '',
  agreed_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  note text not null default '',
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.providers(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists providers_location_idx on public.providers (latitude, longitude);
create index if not exists bookings_customer_created_idx on public.bookings (customer_id, created_at desc);
create index if not exists bookings_provider_created_idx on public.bookings (provider_id, created_at desc);
create index if not exists quotes_booking_idx on public.quotes (booking_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.bookings enable row level security;
alter table public.quotes enable row level security;
alter table public.reviews enable row level security;

-- Profiles: users may read/update only their own profile.
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Provider cards are publicly discoverable; owners control their own listings.
create policy "providers_public_read" on public.providers for select to anon, authenticated using (true);
create policy "providers_owner_insert" on public.providers for insert to authenticated with check (owner_id = auth.uid());
create policy "providers_owner_update" on public.providers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "providers_owner_delete" on public.providers for delete to authenticated using (owner_id = auth.uid());

-- Customers can see/create their own bookings; assigned providers can see bookings assigned to them.
create policy "bookings_participant_read" on public.bookings for select to authenticated using (customer_id = auth.uid() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));
create policy "bookings_customer_insert" on public.bookings for insert to authenticated with check (customer_id = auth.uid());
create policy "bookings_participant_update" on public.bookings for update to authenticated using (customer_id = auth.uid() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid())) with check (customer_id = auth.uid() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));

create policy "quotes_participant_read" on public.quotes for select to authenticated using (exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or exists (select 1 from public.providers p where p.id = quotes.provider_id and p.owner_id = auth.uid()))));
create policy "quotes_provider_insert" on public.quotes for insert to authenticated with check (exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));
create policy "quotes_provider_update" on public.quotes for update to authenticated using (exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));

create policy "reviews_public_read" on public.reviews for select to anon, authenticated using (true);
create policy "reviews_customer_insert" on public.reviews for insert to authenticated with check (customer_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid() and b.status = 'completed'));
