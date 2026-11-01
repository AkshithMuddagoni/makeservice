-- Provision a private bucket for provider KYC and equipment documents.
-- The server will access it using a server-only Supabase secret after the
-- authenticated upload and signed-download endpoints are implemented.
-- Do not create browser storage policies: Better Auth identities are not
-- Supabase Auth identities, and all document access must pass through the app.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $bucket$
      insert into storage.buckets (
        id, name, public, file_size_limit, allowed_mime_types
      )
      values (
        'fieldly-private',
        'fieldly-private',
        false,
        10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
      )
      on conflict (id) do update
        set public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $bucket$;
  end if;
end $$;
