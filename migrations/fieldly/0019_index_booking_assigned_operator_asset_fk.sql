-- Cover the composite booking-to-operator-asset foreign key.
-- This avoids sequential scans when referenced resources are updated/deleted.

CREATE INDEX IF NOT EXISTS bookings_assigned_operator_asset_pair_idx
  ON public.bookings (assigned_operator_id, assigned_asset_id);