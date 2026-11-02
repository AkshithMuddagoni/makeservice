-- Cover composite foreign keys in the same leading-column order as the
-- referenced operator/asset keys. The existing business-first indexes are
-- useful for provider-scoped dashboard reads but do not cover these FK checks.
create index if not exists provider_operator_assets_operator_business_fk_idx
  on public.provider_operator_assets (operator_id, business_id);

create index if not exists provider_operator_assets_asset_business_fk_idx
  on public.provider_operator_assets (asset_id, business_id);
