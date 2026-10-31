-- Better Auth rateLimit model used for persistent OTP abuse controls.
-- Storage is configured as "database" in src/lib/auth/server.ts.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- The app backend uses the server-side PostgreSQL connection. No browser
-- policy is created for this table; anon/authenticated remain denied.
alter table "rateLimit" enable row level security;
