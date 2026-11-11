-- =============================================================================
-- 20261110160400: Buy a class card online (plan docs/plans/CLASS-CARDS.md).
-- The client starts a purchase in the portal: the card is held as
-- 'awaiting_payment' and a payment request (job_payment_requests, the existing
-- /pay/:token checkout) is opened for its price. When the request is paid the
-- card starts; when it is cancelled or refunded the card is cancelled.
-- The request hangs off the client's (or family's) active class enrolment,
-- because payment requests and the payment callbacks need an engagement.
-- ADDITIVE MIGRATION: one column, one trigger, one new function, one read
-- rebuilt with the pay link.
-- =============================================================================

ALTER TABLE job_payment_requests ADD COLUMN class_card_id UUID REFERENCES class_cards(id);
COMMENT ON COLUMN job_payment_requests.class_card_id IS
  'Set when this request pays for a class card bought online. Paying it starts the card.';
-- One open request per card.
CREATE UNIQUE INDEX uq_job_payment_requests_open_class_card ON job_payment_requests(class_card_id)
  WHERE class_card_id IS NOT NULL AND status IN ('pending', 'sent');
CREATE INDEX idx_job_payment_requests_class_card ON job_payment_requests(class_card_id)
  WHERE class_card_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Keep the card in step with its payment request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION class_cards_follow_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card   class_cards%ROWTYPE;
  v_months INT;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  IF NEW.class_card_id IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_card FROM class_cards WHERE id = NEW.class_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND v_card.status = 'awaiting_payment' THEN
    SELECT valid_months INTO v_months FROM class_card_types WHERE id = v_card.card_type_id;
    UPDATE class_cards
       SET status = 'active', starts_on = v_today, payment_id = NEW.payment_id,
           valid_until = CASE WHEN v_months IS NOT NULL THEN (v_today + make_interval(months => v_months))::date END
     WHERE id = v_card.id;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_card.tenant_id, NULL, 'class_card.paid', 'class_card', v_card.id,
            jsonb_build_object('job_payment_request_id', NEW.id, 'payment_id', NEW.payment_id));

  ELSIF NEW.status IN ('cancelled', 'refunded_manual') AND v_card.status <> 'cancelled' THEN
    UPDATE class_cards SET status = 'cancelled' WHERE id = v_card.id;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_card.tenant_id, NULL, 'class_card.cancelled', 'class_card', v_card.id,
            jsonb_build_object('job_payment_request_id', NEW.id, 'request_status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION class_cards_follow_request() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_class_cards_follow_request
  AFTER UPDATE OF status ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION class_cards_follow_request();

-- ---------------------------------------------------------------------------
-- Client: start buying a card. Returns the card and, when there is something
-- to pay, the /pay/:token link token. Starting again for the same card type
-- and person reuses the open purchase. A free card starts at once.
-- p_person_id: who holds the card (me or someone in my family); default me.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_class_card_purchase(p_card_type_id UUID, p_person_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type       class_card_types%ROWTYPE;
  v_person     people%ROWTYPE;
  v_card       class_cards%ROWTYPE;
  v_token      TEXT;
  v_engagement UUID;
  v_today      DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT * INTO v_type FROM class_card_types WHERE id = p_card_type_id;
  IF NOT FOUND OR v_type.tenant_id IS DISTINCT FROM get_my_tenant_id() THEN
    RAISE EXCEPTION 'class_card: type_not_found';
  END IF;
  IF NOT private.class_cards_enabled(v_type.tenant_id) THEN RAISE EXCEPTION 'class_card: switched_off'; END IF;
  IF NOT v_type.is_active THEN RAISE EXCEPTION 'class_card: type_not_active'; END IF;

  SELECT * INTO v_person FROM people
   WHERE id = COALESCE(p_person_id, get_my_person_id()) AND tenant_id = v_type.tenant_id;
  IF NOT FOUND OR NOT (
       v_person.id = get_my_person_id()
       OR (v_person.account_id IS NOT NULL AND v_person.account_id IN (SELECT get_my_account_ids()))) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- An open purchase of the same card: send the client back to it.
  SELECT c.* INTO v_card FROM class_cards c
   WHERE c.card_type_id = v_type.id AND c.person_id = v_person.id AND c.status = 'awaiting_payment'
     AND EXISTS (SELECT 1 FROM job_payment_requests r
                  WHERE r.class_card_id = c.id AND r.status IN ('pending', 'sent'))
   ORDER BY c.created_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT public_token INTO v_token FROM job_payment_requests
     WHERE class_card_id = v_card.id AND status IN ('pending', 'sent');
    RETURN jsonb_build_object('card_id', v_card.id, 'status', v_card.status, 'pay_token', v_token);
  END IF;

  IF v_type.price_minor = 0 THEN
    INSERT INTO class_cards (tenant_id, card_type_id, person_id, account_id, name, class_count, price_minor, currency,
                             status, starts_on, valid_until, created_by)
    VALUES (v_type.tenant_id, v_type.id, v_person.id,
            CASE WHEN v_type.shareable THEN v_person.account_id END,
            v_type.name, v_type.class_count, 0, v_type.currency, 'active', v_today,
            CASE WHEN v_type.valid_months IS NOT NULL THEN (v_today + make_interval(months => v_type.valid_months))::date END,
            auth.uid())
    RETURNING * INTO v_card;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_card.tenant_id, auth.uid(), 'class_card.issued', 'class_card', v_card.id,
            jsonb_build_object('person_id', v_card.person_id, 'card_type_id', v_type.id, 'online', true));
    RETURN jsonb_build_object('card_id', v_card.id, 'status', v_card.status, 'pay_token', NULL);
  END IF;

  -- Payment requests need an engagement: the holder's active class enrolment, else the family's.
  SELECT e.id INTO v_engagement
    FROM engagements e JOIN people p ON p.id = e.person_id
   WHERE e.tenant_id = v_type.tenant_id AND e.status = 'active'
     AND (e.person_id = v_person.id OR (v_person.account_id IS NOT NULL AND p.account_id = v_person.account_id))
   ORDER BY (e.person_id = v_person.id) DESC, e.created_at DESC
   LIMIT 1;
  IF v_engagement IS NULL THEN RAISE EXCEPTION 'class_card: needs_enrolment'; END IF;

  INSERT INTO class_cards (tenant_id, card_type_id, person_id, account_id, name, class_count, price_minor, currency,
                           status, created_by)
  VALUES (v_type.tenant_id, v_type.id, v_person.id,
          CASE WHEN v_type.shareable THEN v_person.account_id END,
          v_type.name, v_type.class_count, v_type.price_minor, v_type.currency, 'awaiting_payment', auth.uid())
  RETURNING * INTO v_card;

  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor, currency, max_installments, class_card_id)
  VALUES (v_type.tenant_id, v_engagement, left(v_type.name, 120), v_type.price_minor, v_type.currency, 1, v_card.id)
  RETURNING public_token INTO v_token;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_card.tenant_id, auth.uid(), 'class_card.purchase_started', 'class_card', v_card.id,
          jsonb_build_object('person_id', v_card.person_id, 'card_type_id', v_type.id, 'amount_minor', v_type.price_minor));
  RETURN jsonb_build_object('card_id', v_card.id, 'status', v_card.status, 'pay_token', v_token);
END;
$$;
REVOKE ALL ON FUNCTION start_class_card_purchase(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_class_card_purchase(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- The portal list now carries the pay link for a card waiting for payment.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_my_class_cards();
CREATE FUNCTION get_my_class_cards()
RETURNS TABLE (id UUID, person_id UUID, name TEXT, class_count INT, classes_left INT, status TEXT,
               starts_on DATE, valid_until DATE, shared BOOLEAN, extension_requested_at TIMESTAMPTZ,
               extended_at TIMESTAMPTZ, pay_token TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.person_id, c.name, c.class_count, private.class_card_classes_left(c.id), c.status,
         c.starts_on, c.valid_until, c.account_id IS NOT NULL, c.extension_requested_at, c.extended_at,
         (SELECT r.public_token FROM job_payment_requests r
           WHERE r.class_card_id = c.id AND r.status IN ('pending', 'sent') LIMIT 1)
    FROM class_cards c
   WHERE private.class_cards_enabled(c.tenant_id)
     AND c.status <> 'cancelled'
     AND private.class_card_is_holder(c)
   ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION get_my_class_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_class_cards() TO authenticated;
