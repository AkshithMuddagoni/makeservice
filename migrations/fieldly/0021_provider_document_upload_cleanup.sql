-- Track and retry Storage API cleanup for abandoned provider document uploads.
-- File bytes are always deleted through Supabase Storage API; never DELETE
-- directly from storage.objects.

ALTER TABLE public.provider_document_upload_sessions
  ADD COLUMN IF NOT EXISTS storage_cleanup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_cleanup_last_attempt_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.provider_document_upload_sessions'::regclass
      AND conname = 'provider_document_upload_sessions_cleanup_attempts_check'
  ) THEN
    ALTER TABLE public.provider_document_upload_sessions
      ADD CONSTRAINT provider_document_upload_sessions_cleanup_attempts_check
      CHECK (storage_cleanup_attempts BETWEEN 0 AND 10);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS provider_document_upload_sessions_cleanup_idx
  ON public.provider_document_upload_sessions (expires_at, id)
  WHERE status IN ('pending', 'expired', 'failed')
    AND storage_cleanup_completed_at IS NULL
    AND storage_cleanup_attempts < 10;

COMMENT ON COLUMN public.provider_document_upload_sessions.storage_cleanup_completed_at IS
  'Set only after the Storage API confirms removal or the Storage object is verified absent.';
COMMENT ON COLUMN public.provider_document_upload_sessions.storage_cleanup_attempts IS
  'Number of cleanup attempts; automatic retry stops after 10 attempts so persistent failures remain visible for manual review.';
COMMENT ON COLUMN public.provider_document_upload_sessions.storage_cleanup_last_attempt_at IS
  'Timestamp of the last Storage API cleanup attempt.';
