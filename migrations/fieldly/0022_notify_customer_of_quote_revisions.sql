-- Notify the customer when an already-pending provider quote is materially revised.
-- Do not create another "quote received" notification for status-only updates
-- (for example, acceptance) or timestamp-only writes. The content digest makes
-- each distinct quote version idempotent across retries.

CREATE OR REPLACE FUNCTION public.fieldly_notify_customer_of_quote()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_provider_name text;
  v_version_digest text;
  v_title text;
  v_body text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only a still-pending quote that changes customer-visible terms warrants
    -- a new notification. Acceptance/withdrawal is handled by booking/status events.
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RETURN NEW;
    END IF;

    IF NEW.amount_paise IS NOT DISTINCT FROM OLD.amount_paise
       AND NEW.note IS NOT DISTINCT FROM OLD.note
       AND NEW.inclusions IS NOT DISTINCT FROM OLD.inclusions
       AND NEW.exclusions IS NOT DISTINCT FROM OLD.exclusions
       AND NEW.extra_charges IS NOT DISTINCT FROM OLD.extra_charges
       AND NEW.cancellation_terms IS NOT DISTINCT FROM OLD.cancellation_terms
       AND NEW.eta_minutes IS NOT DISTINCT FROM OLD.eta_minutes THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT jr.customer_user_id, pb.trading_name
    INTO v_user_id, v_provider_name
  FROM public.job_requests jr
  JOIN public.provider_businesses pb ON pb.id = NEW.business_id
  WHERE jr.id = NEW.request_id;

  IF v_user_id IS NOT NULL THEN
    v_version_digest := md5(concat_ws(
      E'\x1f',
      NEW.amount_paise::text,
      NEW.note,
      NEW.inclusions::text,
      NEW.exclusions::text,
      NEW.extra_charges::text,
      NEW.cancellation_terms,
      coalesce(NEW.eta_minutes::text, '')
    ));
    v_title := CASE WHEN TG_OP = 'UPDATE'
      THEN 'A provider updated their quote'
      ELSE 'A provider sent you a quote'
    END;
    v_body := CASE WHEN TG_OP = 'UPDATE'
      THEN format('%s updated their quote for your service request.', coalesce(v_provider_name, 'A provider'))
      ELSE format('%s sent a quote for your service request.', coalesce(v_provider_name, 'A provider'))
    END;

    INSERT INTO public.fieldly_notifications
      (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
    VALUES
      (v_user_id, 'quote_received', v_title, v_body,
       'request', NEW.request_id,
       'quote_received:' || NEW.id::text || ':' || v_version_digest || ':' || v_user_id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
