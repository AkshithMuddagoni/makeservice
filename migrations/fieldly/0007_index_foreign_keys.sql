-- Add covering indexes for foreign keys used in operational lookups and
-- deletes. Keep the existing owner index and remove its exact duplicate.
create index if not exists booking_events_actor_user_id_idx
  on public.booking_events (actor_user_id);
create index if not exists booking_live_locations_business_id_idx
  on public.booking_live_locations (business_id);
create index if not exists booking_live_locations_operator_id_idx
  on public.booking_live_locations (operator_id);
create index if not exists booking_messages_sender_user_id_idx
  on public.booking_messages (sender_user_id);
create index if not exists bookings_assigned_asset_id_idx
  on public.bookings (assigned_asset_id);
create index if not exists bookings_assigned_operator_id_idx
  on public.bookings (assigned_operator_id);
create index if not exists bookings_provider_service_id_idx
  on public.bookings (provider_service_id);
create index if not exists fieldly_admin_audit_admin_user_id_idx
  on public.fieldly_admin_audit (admin_user_id);
create index if not exists fieldly_user_roles_granted_by_idx
  on public.fieldly_user_roles (granted_by);
create index if not exists job_request_targets_business_id_idx
  on public.job_request_targets (business_id);
create index if not exists job_request_targets_provider_service_id_idx
  on public.job_request_targets (provider_service_id);
create index if not exists provider_asset_services_provider_service_id_idx
  on public.provider_asset_services (provider_service_id);
create index if not exists provider_assets_reviewed_by_idx
  on public.provider_assets (reviewed_by);
create index if not exists provider_businesses_reviewed_by_idx
  on public.provider_businesses (reviewed_by);
create index if not exists provider_documents_asset_id_idx
  on public.provider_documents (asset_id);
create index if not exists provider_documents_operator_id_idx
  on public.provider_documents (operator_id);
create index if not exists provider_documents_provider_service_id_idx
  on public.provider_documents (provider_service_id);
create index if not exists provider_documents_reviewed_by_idx
  on public.provider_documents (reviewed_by);
create index if not exists provider_operators_linked_user_id_idx
  on public.provider_operators (linked_user_id);
create index if not exists provider_quotes_business_id_idx
  on public.provider_quotes (business_id);
create index if not exists provider_services_reviewed_by_idx
  on public.provider_services (reviewed_by);

drop index if exists public.provider_businesses_owner_lookup_idx;
