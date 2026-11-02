-- Auditable administrator case handling for booking disputes.
DO $$
BEGIN
  CREATE TYPE public.fieldly_dispute_status AS ENUM (
    'open',
    'under_review',
    'awaiting_customer',
    'awaiting_provider',
    'resolved_customer',
    'resolved_provider',
    'closed_no_action'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS dispute_status public.fieldly_dispute_status,
  ADD COLUMN IF NOT EXISTS dispute_resolution_note text,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by text REFERENCES public."user" (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;

UPDATE public.bookings
SET dispute_status = 'open'
WHERE status = 'disputed' AND dispute_status IS NULL;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_dispute_resolution_note_length
    CHECK (dispute_resolution_note IS NULL OR length(dispute_resolution_note) <= 2000),
  ADD CONSTRAINT bookings_dispute_terminal_audit
    CHECK (
      dispute_status NOT IN ('resolved_customer', 'resolved_provider', 'closed_no_action')
      OR (dispute_resolved_at IS NOT NULL AND dispute_resolved_by IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS bookings_dispute_queue_idx
  ON public.bookings (dispute_status, updated_at DESC)
  WHERE status = 'disputed';
