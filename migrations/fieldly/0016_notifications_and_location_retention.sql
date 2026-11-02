-- Durable in-app notifications and bounded live-location retention.
CREATE TABLE IF NOT EXISTS public.fieldly_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id text NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN (
    'request_received',
    'quote_received',
    'booking_created',
    'booking_status',
    'booking_message',
    'provider_application'
  )),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  target_type text NOT NULL CHECK (target_type IN ('request', 'booking', 'provider_application')),
  target_id uuid NOT NULL,
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS fieldly_notifications_recipient_timeline_idx
  ON public.fieldly_notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fieldly_notifications_unread_idx
  ON public.fieldly_notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.fieldly_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fieldly_notifications FROM anon, authenticated;

-- Notifications are inserted by database triggers so every successful server
-- transaction has the corresponding in-app event, without a second client call.
CREATE OR REPLACE FUNCTION public.fieldly_notify_provider_of_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_service_id text;
  v_area text;
  v_city text;
BEGIN
  SELECT pb.owner_user_id, jr.service_id, jr.area, jr.city
    INTO v_user_id, v_service_id, v_area, v_city
  FROM public.job_requests jr
  JOIN public.provider_businesses pb ON pb.id = NEW.business_id
  WHERE jr.id = NEW.request_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.fieldly_notifications
      (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
    VALUES
      (v_user_id, 'request_received', 'New service request',
       format('A %s request is available near %s, %s.', replace(v_service_id, '_', ' '), coalesce(v_area, 'your area'), coalesce(v_city, 'your city')),
       'request', NEW.request_id,
       'request_received:' || NEW.request_id::text || ':' || NEW.business_id::text || ':' || v_user_id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_notify_provider_request_target
AFTER INSERT ON public.job_request_targets
FOR EACH ROW EXECUTE FUNCTION public.fieldly_notify_provider_of_request();

CREATE OR REPLACE FUNCTION public.fieldly_notify_customer_of_quote()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_provider_name text;
BEGIN
  SELECT jr.customer_user_id, pb.trading_name
    INTO v_user_id, v_provider_name
  FROM public.job_requests jr
  JOIN public.provider_businesses pb ON pb.id = NEW.business_id
  WHERE jr.id = NEW.request_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.fieldly_notifications
      (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
    VALUES
      (v_user_id, 'quote_received', 'A provider sent you a quote',
       format('%s sent a quote for your service request.', coalesce(v_provider_name, 'A provider')),
       'request', NEW.request_id,
       'quote_received:' || NEW.id::text || ':' || v_user_id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_notify_customer_provider_quote
AFTER INSERT OR UPDATE OF amount_paise, note, updated_at ON public.provider_quotes
FOR EACH ROW EXECUTE FUNCTION public.fieldly_notify_customer_of_quote();

CREATE OR REPLACE FUNCTION public.fieldly_notify_booking_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_provider_user_id text;
  v_recipient text;
  v_title text;
  v_body text;
  v_key text;
BEGIN
  SELECT owner_user_id INTO v_provider_user_id
  FROM public.provider_businesses WHERE id = NEW.business_id;

  IF TG_OP = 'INSERT' THEN
    v_title := 'Booking confirmed';
    v_body := format('Your booking %s is confirmed.', NEW.public_reference);
    FOR v_recipient IN
      SELECT DISTINCT unnest(ARRAY[NEW.customer_user_id, v_provider_user_id])
      WHERE unnest IS NOT NULL
    LOOP
      INSERT INTO public.fieldly_notifications
        (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
      VALUES
        (v_recipient, 'booking_created', v_title, v_body, 'booking', NEW.id,
         'booking_created:' || NEW.id::text || ':' || v_recipient)
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_title := CASE NEW.status::text
      WHEN 'on_the_way' THEN 'Provider is on the way'
      WHEN 'arrived' THEN 'Provider has arrived'
      WHEN 'service_started' THEN 'Work has started'
      WHEN 'service_completed' THEN 'Work completed'
      WHEN 'paid' THEN 'Payment recorded'
      WHEN 'cancelled' THEN 'Booking cancelled'
      WHEN 'disputed' THEN 'Booking dispute raised'
      ELSE 'Booking updated'
    END;
    v_body := format('Booking %s is now %s.', NEW.public_reference, replace(NEW.status::text, '_', ' '));
    v_key := 'booking_status:' || NEW.id::text || ':' || NEW.status::text;
    FOR v_recipient IN
      SELECT DISTINCT unnest(ARRAY[NEW.customer_user_id, v_provider_user_id])
      WHERE unnest IS NOT NULL
    LOOP
      INSERT INTO public.fieldly_notifications
        (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
      VALUES
        (v_recipient, 'booking_status', v_title, v_body, 'booking', NEW.id,
         v_key || ':' || v_recipient)
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_notify_booking_created
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.fieldly_notify_booking_participants();

CREATE TRIGGER fieldly_notify_booking_status
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fieldly_notify_booking_participants();

CREATE OR REPLACE FUNCTION public.fieldly_notify_booking_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_customer_user_id text;
  v_provider_user_id text;
  v_operator_user_id text;
  v_recipient text;
BEGIN
  SELECT b.customer_user_id, pb.owner_user_id, po.linked_user_id
    INTO v_customer_user_id, v_provider_user_id, v_operator_user_id
  FROM public.bookings b
  JOIN public.provider_businesses pb ON pb.id = b.business_id
  LEFT JOIN public.provider_operators po ON po.id = b.assigned_operator_id
  WHERE b.id = NEW.booking_id;

  IF NEW.sender_user_id = v_customer_user_id THEN
    FOR v_recipient IN
      SELECT DISTINCT unnest(ARRAY[v_provider_user_id, v_operator_user_id])
      WHERE unnest IS NOT NULL AND unnest <> NEW.sender_user_id
    LOOP
      INSERT INTO public.fieldly_notifications
        (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
      VALUES
        (v_recipient, 'booking_message', 'New booking message',
         'You have a new message about booking ' || NEW.booking_id::text || '.',
         'booking', NEW.booking_id,
         'booking_message:' || NEW.id::text || ':' || v_recipient)
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
  ELSE
    INSERT INTO public.fieldly_notifications
      (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
    VALUES
      (v_customer_user_id, 'booking_message', 'New booking message',
       'You have a new message about booking ' || NEW.booking_id::text || '.',
       'booking', NEW.booking_id,
       'booking_message:' || NEW.id::text || ':' || v_customer_user_id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_notify_booking_message_recipient
AFTER INSERT ON public.booking_messages
FOR EACH ROW EXECUTE FUNCTION public.fieldly_notify_booking_message();

CREATE OR REPLACE FUNCTION public.fieldly_notify_provider_application_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    INSERT INTO public.fieldly_notifications
      (recipient_user_id, notification_type, title, body, target_type, target_id, event_key)
    VALUES
      (NEW.owner_user_id, 'provider_application', 'Provider application updated',
       format('Your %s application is now %s.', NEW.trading_name, replace(NEW.verification_status::text, '_', ' ')),
       'provider_application', NEW.id,
       'provider_application:' || NEW.id::text || ':' || NEW.verification_status::text || ':' || NEW.updated_at::text)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_notify_provider_application
AFTER UPDATE OF verification_status ON public.provider_businesses
FOR EACH ROW EXECUTE FUNCTION public.fieldly_notify_provider_application_status();

-- Keep live coordinates short-lived even if the provider never reopens the app.
-- Rows are pruned during GPS writes once they have been expired for 24 hours.
CREATE OR REPLACE FUNCTION public.fieldly_prune_expired_booking_locations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.booking_live_locations
  WHERE expires_at < now() - interval '24 hours';
  RETURN NULL;
END;
$$;

CREATE TRIGGER fieldly_prune_expired_booking_locations
AFTER INSERT OR UPDATE ON public.booking_live_locations
FOR EACH STATEMENT EXECUTE FUNCTION public.fieldly_prune_expired_booking_locations();

-- Stop publishing and remove coordinates as soon as a booking becomes terminal
-- or disputed, rather than waiting for the two-minute location timeout.
CREATE OR REPLACE FUNCTION public.fieldly_clear_terminal_booking_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('service_completed', 'paid', 'cancelled', 'disputed') THEN
    DELETE FROM public.booking_live_locations WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fieldly_clear_terminal_booking_location
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fieldly_clear_terminal_booking_location();
