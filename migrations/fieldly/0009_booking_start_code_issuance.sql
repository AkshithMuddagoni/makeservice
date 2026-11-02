-- Track only the last start-code issuance timestamp so customers can
-- regenerate a one-time service-start code after a brief cooldown without
-- storing the plaintext code. The hash remains the only stored credential.
alter table public.bookings
  add column if not exists start_code_issued_at timestamptz;

create index if not exists bookings_start_code_issued_idx
  on public.bookings (start_code_issued_at)
  where start_code_hash is not null;
