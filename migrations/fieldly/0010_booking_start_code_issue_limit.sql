-- Limit the number of customer-issued service-start codes per booking.
-- The code itself is never stored, only its HMAC digest.
alter table public.bookings
  add column if not exists start_code_issue_count smallint not null default 0;

alter table public.bookings
  drop constraint if exists bookings_start_code_issue_count_check;

alter table public.bookings
  add constraint bookings_start_code_issue_count_check
  check (start_code_issue_count between 0 and 5);
