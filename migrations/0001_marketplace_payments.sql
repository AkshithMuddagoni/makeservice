-- Cashfree Easy Split foundation for Fieldly marketplace payments.
--
-- These records are intentionally not linked to the current browser-local
-- booking/provider store. A later migration must move Fieldly's canonical
-- bookings, quotes, profiles and providers into the shared database and add
-- validated foreign keys before any live payment endpoint is enabled.
--
-- Store integer paise, not floating-point rupees. Never store card numbers,
-- CVV, UPI PIN, full bank credentials, Aadhaar/PAN images or raw KYC payloads.

create table if not exists fieldly_payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_ref text not null unique,
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  gateway_vendor_id text unique,
  onboarding_status text not null default 'NOT_STARTED'
    check (onboarding_status in (
      'NOT_STARTED', 'SUBMITTED', 'KYC_REQUIRED', 'UNDER_REVIEW',
      'ACTIVE', 'ON_HOLD', 'REJECTED', 'DISABLED'
    )),
  settlement_schedule_id text,
  currency text not null default 'INR' check (currency = 'INR'),
  last_gateway_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fieldly_payment_provider_status_idx
  on fieldly_payment_provider_accounts (onboarding_status, updated_at desc);

create table if not exists fieldly_payment_orders (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null,
  quote_ref text not null,
  customer_ref text not null,
  provider_ref text not null,
  stage text not null
    check (stage in ('BOOKING_ADVANCE', 'MILESTONE', 'FINAL_BALANCE', 'ADJUSTMENT')),
  stage_label text not null,
  currency text not null default 'INR' check (currency = 'INR'),
  quoted_total_paise bigint not null check (quoted_total_paise > 0),
  amount_paise bigint not null check (amount_paise > 0),
  provider_share_paise bigint not null check (provider_share_paise >= 0),
  platform_share_paise bigint not null check (platform_share_paise >= 0),
  commission_bps integer not null check (commission_bps between 0 and 9999),
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  gateway_order_id text unique,
  status text not null default 'CREATED'
    check (status in (
      'CREATED', 'CHECKOUT_READY', 'PENDING', 'PAID', 'FAILED', 'EXPIRED',
      'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVIEW_REQUIRED'
    )),
  idempotency_key text not null unique,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fieldly_payment_order_split_balances
    check (provider_share_paise + platform_share_paise = amount_paise)
);

create index if not exists fieldly_payment_orders_booking_idx
  on fieldly_payment_orders (booking_ref, created_at);
create index if not exists fieldly_payment_orders_customer_idx
  on fieldly_payment_orders (customer_ref, created_at desc);
create index if not exists fieldly_payment_orders_provider_idx
  on fieldly_payment_orders (provider_ref, created_at desc);
create index if not exists fieldly_payment_orders_status_idx
  on fieldly_payment_orders (status, created_at);

create table if not exists fieldly_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null
    references fieldly_payment_orders(id) on delete restrict,
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  gateway_payment_id text unique,
  payment_method text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SUCCESS', 'FAILED', 'USER_DROPPED', 'UNKNOWN')),
  bank_reference text,
  gateway_error_code text,
  gateway_error_message text,
  gateway_created_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fieldly_payment_attempts_order_idx
  on fieldly_payment_attempts (payment_order_id, created_at desc);

create table if not exists fieldly_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  event_fingerprint text not null unique
    check (length(event_fingerprint) = 64),
  event_type text not null,
  gateway_order_id text,
  gateway_payment_id text,
  signature_verified boolean not null check (signature_verified = true),
  safe_metadata jsonb not null default '{}'::jsonb,
  processing_status text not null default 'RECEIVED'
    check (processing_status in ('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'IGNORED', 'DEAD_LETTER')),
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists fieldly_payment_webhook_order_idx
  on fieldly_payment_webhook_events (gateway_order_id, received_at desc);
create index if not exists fieldly_payment_webhook_status_idx
  on fieldly_payment_webhook_events (processing_status, received_at);

create table if not exists fieldly_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null
    references fieldly_payment_orders(id) on delete restrict,
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  gateway_refund_id text unique,
  idempotency_key text not null unique,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN')),
  reason_code text,
  reason_note text,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists fieldly_payment_refunds_order_idx
  on fieldly_payment_refunds (payment_order_id, initiated_at desc);

create table if not exists fieldly_vendor_settlements (
  id uuid primary key default gen_random_uuid(),
  provider_ref text not null,
  gateway text not null default 'CASHFREE' check (gateway = 'CASHFREE'),
  gateway_vendor_id text not null,
  gateway_settlement_id text,
  gateway_transfer_id text unique,
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null
    check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED', 'UNKNOWN')),
  settlement_reference text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fieldly_vendor_settlements_provider_idx
  on fieldly_vendor_settlements (provider_ref, created_at desc);
create index if not exists fieldly_vendor_settlements_status_idx
  on fieldly_vendor_settlements (status, created_at);

-- Append-only by service-layer convention. Each journal_id must balance:
-- total DEBIT paise = total CREDIT paise. The payment service must insert all
-- lines in one DB transaction and reject unbalanced journals.
create table if not exists fieldly_payment_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null,
  payment_order_id uuid not null
    references fieldly_payment_orders(id) on delete restrict,
  refund_id uuid references fieldly_payment_refunds(id) on delete restrict,
  webhook_event_id uuid references fieldly_payment_webhook_events(id) on delete restrict,
  account_code text not null,
  side text not null check (side in ('DEBIT', 'CREDIT')),
  amount_paise bigint not null check (amount_paise > 0),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fieldly_payment_ledger_journal_idx
  on fieldly_payment_ledger_entries (journal_id, created_at);
create index if not exists fieldly_payment_ledger_order_idx
  on fieldly_payment_ledger_entries (payment_order_id, created_at);
