-- Cover the bookings.dispute_resolved_by foreign key so parent user deletes/updates
-- do not require a sequential scan of the bookings table.
CREATE INDEX IF NOT EXISTS bookings_dispute_resolved_by_idx
  ON public.bookings (dispute_resolved_by);
