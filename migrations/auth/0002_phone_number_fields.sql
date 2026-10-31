-- Better Auth Phone Number plugin schema extension.
-- Keep migrations/auth/0001_auth.sql byte-for-byte as generated.
alter table "user"
  add column if not exists "phoneNumber" text;

alter table "user"
  add column if not exists "phoneNumberVerified" boolean not null default false;

create unique index if not exists "user_phoneNumber_unique"
  on "user" ("phoneNumber")
  where "phoneNumber" is not null;
