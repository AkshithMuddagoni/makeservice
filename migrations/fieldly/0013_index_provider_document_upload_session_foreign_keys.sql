-- Add indexes for the optional foreign keys introduced by the document
-- upload-session workflow. PostgreSQL does not automatically index referencing
-- columns, and the upload-session owner/business indexes do not cover these
-- individual asset, service and operator lookups or parent-row deletes.
create index if not exists provider_document_upload_sessions_provider_service_id_idx
  on public.provider_document_upload_sessions (provider_service_id);

create index if not exists provider_document_upload_sessions_asset_id_idx
  on public.provider_document_upload_sessions (asset_id);

create index if not exists provider_document_upload_sessions_operator_id_idx
  on public.provider_document_upload_sessions (operator_id);
