/**
 * Public discovery query. Eligibility is derived from server-owned review,
 * asset, service and presence records. Never return documents or owner PII.
 * $1 service id, $2 latitude, $3 longitude, $4 radius km, $5 result limit.
 */
export const PROVIDER_DISCOVERY_SQL = `
with candidates as (
  select
    pb.id::text as business_id,
    ps.id::text as provider_service_id,
    pb.trading_name as name,
    coalesce(pb.area, '') as area,
    coalesce(pb.city, pb.district, '') as city,
    pb.district,
    pb.state,
    pb.latitude,
    pb.longitude,
    pb.years_experience,
    pb.languages,
    pb.bio,
    coalesce(assets.equipment, '') as equipment,
    coalesce(reviews.rating, 0)::double precision as rating,
    coalesce(reviews.review_count, 0)::integer as review_count,
    (
      6371.0 * acos(
        least(1.0, greatest(-1.0,
          sin(radians($2::double precision)) * sin(radians(pb.latitude))
          + cos(radians($2::double precision)) * cos(radians(pb.latitude))
          * cos(radians(pb.longitude - $3::double precision))
        ))
      )
    ) as distance_km
  from public.provider_businesses pb
  join public.provider_services ps
    on ps.business_id = pb.id and ps.service_id = $1
  join public.provider_presence presence
    on presence.business_id = pb.id
   and presence.is_online = true
   and coalesce(presence.last_seen_at, presence.updated_at) >= now() - interval '10 minutes'
  left join lateral (
    select string_agg(
      distinct concat_ws(' ', nullif(pa.asset_type, ''), nullif(pa.make, ''), nullif(pa.model, '')),
      ', ' order by concat_ws(' ', nullif(pa.asset_type, ''), nullif(pa.make, ''), nullif(pa.model, ''))
    ) as equipment
    from public.provider_asset_services pas
    join public.provider_assets pa
      on pa.id = pas.asset_id and pa.business_id = pb.id
    where pas.provider_service_id = ps.id
      and pa.verification_status = 'approved'
      and pa.is_available = true
  ) assets on true
  left join lateral (
    select round(avg(r.rating)::numeric, 1) as rating, count(*)::integer as review_count
    from public.provider_reviews r
    where r.business_id = pb.id and r.is_visible = true
  ) reviews on true
  where pb.verification_status = 'approved'
    and pb.is_suspended = false
    and pb.latitude is not null
    and pb.longitude is not null
    and ps.verification_status = 'approved'
    and ps.is_listed = true
    and ps.is_available = true
    and exists (
      select 1
      from public.provider_asset_services pas
      join public.provider_assets pa
        on pa.id = pas.asset_id and pa.business_id = pb.id
      where pas.provider_service_id = ps.id
        and pa.verification_status = 'approved'
        and pa.is_available = true
    )
)
select business_id, provider_service_id, name, area, city, district, state,
       latitude, longitude, years_experience, languages, bio, equipment,
       rating, review_count, distance_km
from candidates
where distance_km <= $4
order by distance_km asc, rating desc, review_count desc
limit least($5::integer, 50)
`;
