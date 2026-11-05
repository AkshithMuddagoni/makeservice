-- Bind each booking's selected asset and operator to the same provider
-- business, and prevent the same physical resource being reserved twice.
--
-- Resources remain reserved while work is confirmed, travelling, arrived,
-- in progress, or disputed. Once work is service_completed, the physical
-- resources can be allocated to another job even if payment is still pending.
-- A dispute raised after completion reserves the resources again.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE (assigned_asset_id IS NULL) <> (assigned_operator_id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Cannot add booking resource assignment rules: existing bookings have only one of assigned_asset_id / assigned_operator_id set.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.provider_assets pa ON pa.id = b.assigned_asset_id
    WHERE b.assigned_asset_id IS NOT NULL
      AND pa.business_id <> b.business_id
  ) THEN
    RAISE EXCEPTION
      'Cannot add booking resource assignment rules: a booking references an asset from another provider business.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.provider_operators po ON po.id = b.assigned_operator_id
    WHERE b.assigned_operator_id IS NOT NULL
      AND po.business_id <> b.business_id
  ) THEN
    RAISE EXCEPTION
      'Cannot add booking resource assignment rules: a booking references an operator from another provider business.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE assigned_asset_id IS NOT NULL
      AND status IN ('confirmed', 'on_the_way', 'arrived', 'service_started', 'disputed')
    GROUP BY assigned_asset_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add booking resource assignment rules: an asset is already reserved by multiple active bookings.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE assigned_operator_id IS NOT NULL
      AND status IN ('confirmed', 'on_the_way', 'arrived', 'service_started', 'disputed')
    GROUP BY assigned_operator_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add booking resource assignment rules: an operator is already reserved by multiple active bookings.';
  END IF;
END
$$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_assigned_resource_pair_check
  CHECK ((assigned_asset_id IS NULL) = (assigned_operator_id IS NULL))
  NOT VALID;

ALTER TABLE public.bookings
  VALIDATE CONSTRAINT bookings_assigned_resource_pair_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_assigned_asset_business_fk
  FOREIGN KEY (assigned_asset_id, business_id)
  REFERENCES public.provider_assets (id, business_id)
  NOT VALID;

ALTER TABLE public.bookings
  VALIDATE CONSTRAINT bookings_assigned_asset_business_fk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_assigned_operator_business_fk
  FOREIGN KEY (assigned_operator_id, business_id)
  REFERENCES public.provider_operators (id, business_id)
  NOT VALID;

ALTER TABLE public.bookings
  VALIDATE CONSTRAINT bookings_assigned_operator_business_fk;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_assigned_asset_uidx
  ON public.bookings (assigned_asset_id)
  WHERE assigned_asset_id IS NOT NULL
    AND status IN ('confirmed', 'on_the_way', 'arrived', 'service_started', 'disputed');

CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_assigned_operator_uidx
  ON public.bookings (assigned_operator_id)
  WHERE assigned_operator_id IS NOT NULL
    AND status IN ('confirmed', 'on_the_way', 'arrived', 'service_started', 'disputed');

CREATE INDEX IF NOT EXISTS bookings_assigned_asset_business_idx
  ON public.bookings (assigned_asset_id, business_id)
  WHERE assigned_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_assigned_operator_business_idx
  ON public.bookings (assigned_operator_id, business_id)
  WHERE assigned_operator_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.assigned_asset_id IS
  'The approved provider machine reserved for this booking. Assigned atomically with its approved operator.';

COMMENT ON COLUMN public.bookings.assigned_operator_id IS
  'The approved operator linked to the assigned machine for this booking.';
