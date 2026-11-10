-- =============================================================================
-- 20261110160100: Class cards (כרטיסייה), PR 1 of 5: data model and rules.
-- Plan: docs/plans/CLASS-CARDS.md. Nothing in the app uses this yet.
--
-- A client pays once for a bundle of classes (for example 10) and uses one class
-- each time they come: booked in the portal, or ticked in as a walk-in.
--
--   * tenant_class_card_settings: the studio's own on/off switch (OFF by
--     default; no row = off), late-cancel cutoff (12 h) and extension length (3 months).
--   * class_card_types: the cards a studio sells (classes, price, months valid,
--     personal or shared in one family account), and the classes each covers.
--   * class_cards: a card a person holds. valid_until NULL = never expires.
--   * class_card_visits: each class taken from a card. Classes left = classes
--     bought minus visits that count (booked, attended, late cancel, no-show).
--     Cancelling in time or the admin giving a class back frees it again.
--
-- Writes to cards and visits only go through the functions below (row-locked,
-- audited). Money: paying for a card is PR 2; nothing here charges anyone.
-- Make-up credits (service_credits) and account credit stay separate.
--
-- ADDITIVE MIGRATION: new objects only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Who is who (plain helpers; called from the definer functions below)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.class_cards_is_admin(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(is_super_admin(), false) OR COALESCE(
    p_tenant_id = get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)), false);
$$;
REVOKE EXECUTE ON FUNCTION private.class_cards_is_admin(UUID) FROM PUBLIC, anon, authenticated;

-- Admin or teacher (the register).
CREATE OR REPLACE FUNCTION private.class_cards_is_staff(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT private.class_cards_is_admin(p_tenant_id) OR COALESCE(
    p_tenant_id = get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'staff' = ANY(role)), false);
$$;
REVOKE EXECUTE ON FUNCTION private.class_cards_is_staff(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Studio settings (no row = switched off)
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_class_card_settings (
  tenant_id            UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled              BOOLEAN     NOT NULL DEFAULT false,
  cancel_cutoff_hours  INT         NOT NULL DEFAULT 12 CHECK (cancel_cutoff_hours BETWEEN 0 AND 168),
  extension_months     INT         NOT NULL DEFAULT 3  CHECK (extension_months BETWEEN 1 AND 24),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_class_card_settings IS
  'Class cards: the studio admin''s own switch (off by default; no row = off), late-cancel cutoff and the one-time extension length.';

CREATE TRIGGER trigger_tenant_class_card_settings_updated_at
  BEFORE UPDATE ON tenant_class_card_settings
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE tenant_class_card_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tccs_super_admin ON tenant_class_card_settings FOR ALL USING (is_super_admin());
CREATE POLICY tccs_tenant_read ON tenant_class_card_settings FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY tccs_admin_insert ON tenant_class_card_settings FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
CREATE POLICY tccs_admin_update ON tenant_class_card_settings FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id());
GRANT SELECT, INSERT, UPDATE ON TABLE tenant_class_card_settings TO authenticated;
GRANT ALL ON TABLE tenant_class_card_settings TO service_role;

CREATE OR REPLACE FUNCTION private.class_cards_enabled(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM tenant_class_card_settings WHERE tenant_id = p_tenant_id), false);
$$;
REVOKE EXECUTE ON FUNCTION private.class_cards_enabled(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The cards a studio sells
-- ---------------------------------------------------------------------------
CREATE TABLE class_card_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  class_count   INT         NOT NULL CHECK (class_count BETWEEN 1 AND 500),
  price_minor   INT         NOT NULL CHECK (price_minor >= 0),
  currency      TEXT        NOT NULL DEFAULT 'ILS',
  valid_months  INT         DEFAULT 3 CHECK (valid_months IS NULL OR valid_months BETWEEN 1 AND 60),
  shareable     BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE class_card_types IS
  'Class cards a studio sells. valid_months NULL = never expires. shareable = anyone in the buyer''s family account can use it.';
CREATE INDEX idx_class_card_types_tenant ON class_card_types(tenant_id);

CREATE TRIGGER trigger_class_card_types_updated_at
  BEFORE UPDATE ON class_card_types
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

-- Which classes a card covers.
CREATE TABLE class_card_type_offerings (
  card_type_id  UUID NOT NULL REFERENCES class_card_types(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offering_id   UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  PRIMARY KEY (card_type_id, offering_id)
);
CREATE INDEX idx_class_card_type_offerings_offering ON class_card_type_offerings(offering_id);
CREATE INDEX idx_class_card_type_offerings_tenant ON class_card_type_offerings(tenant_id);

-- The card type and the covered class must both be this studio's.
CREATE OR REPLACE FUNCTION private.class_card_type_offering_check()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM class_card_types t WHERE t.id = NEW.card_type_id AND t.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'class card: card type is not this studio''s';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM offerings o
                  WHERE o.id = NEW.offering_id AND o.tenant_id = NEW.tenant_id AND o.offering_type = 'class') THEN
    RAISE EXCEPTION 'class card: offering is not a class of this studio';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.class_card_type_offering_check() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trigger_class_card_type_offering_check
  BEFORE INSERT OR UPDATE ON class_card_type_offerings
  FOR EACH ROW EXECUTE FUNCTION private.class_card_type_offering_check();

ALTER TABLE class_card_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY cct_super_admin ON class_card_types FOR ALL USING (is_super_admin());
CREATE POLICY cct_tenant_read ON class_card_types FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND (is_active OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role))));
CREATE POLICY cct_admin_insert ON class_card_types FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
CREATE POLICY cct_admin_update ON class_card_types FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id());
-- No DELETE: a card type that was sold is switched off (is_active = false) instead.
GRANT SELECT, INSERT, UPDATE ON TABLE class_card_types TO authenticated;
GRANT ALL ON TABLE class_card_types TO service_role;

ALTER TABLE class_card_type_offerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccto_super_admin ON class_card_type_offerings FOR ALL USING (is_super_admin());
CREATE POLICY ccto_tenant_read ON class_card_type_offerings FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY ccto_admin_insert ON class_card_type_offerings FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
CREATE POLICY ccto_admin_delete ON class_card_type_offerings FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT, INSERT, DELETE ON TABLE class_card_type_offerings TO authenticated;
GRANT ALL ON TABLE class_card_type_offerings TO service_role;

-- ---------------------------------------------------------------------------
-- Cards people hold
-- ---------------------------------------------------------------------------
CREATE TABLE class_cards (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  card_type_id            UUID        NOT NULL REFERENCES class_card_types(id),
  person_id               UUID        NOT NULL REFERENCES people(id),
  account_id              UUID        REFERENCES accounts(id),
  name                    TEXT        NOT NULL,
  class_count             INT         NOT NULL CHECK (class_count BETWEEN 1 AND 500),
  price_minor             INT         NOT NULL CHECK (price_minor >= 0),
  currency                TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('awaiting_payment', 'active', 'cancelled')),
  starts_on               DATE,
  valid_until             DATE,
  payment_id              UUID        REFERENCES payments(id),
  extension_requested_at  TIMESTAMPTZ,
  extended_at             TIMESTAMPTZ,
  created_by              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR starts_on IS NOT NULL),
  CHECK (valid_until IS NULL OR starts_on IS NULL OR valid_until >= starts_on)
);
COMMENT ON TABLE class_cards IS
  'A class card a person holds. Name, classes and price are copied from the card type when sold. account_id set = shared within that family account. valid_until NULL = never expires.';
COMMENT ON COLUMN class_cards.extended_at IS
  'Set when the admin extended the card. A card can be extended once.';
CREATE INDEX idx_class_cards_tenant ON class_cards(tenant_id);
CREATE INDEX idx_class_cards_person ON class_cards(person_id);
CREATE INDEX idx_class_cards_account ON class_cards(account_id);
CREATE INDEX idx_class_cards_type ON class_cards(card_type_id);
CREATE INDEX idx_class_cards_payment ON class_cards(payment_id);
CREATE INDEX idx_class_cards_created_by ON class_cards(created_by);

CREATE TRIGGER trigger_class_cards_updated_at
  BEFORE UPDATE ON class_cards
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

-- ---------------------------------------------------------------------------
-- Each class taken from a card
-- ---------------------------------------------------------------------------
CREATE TABLE class_card_visits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  card_id       UUID        NOT NULL REFERENCES class_cards(id),
  person_id     UUID        NOT NULL REFERENCES people(id),
  offering_id   UUID        NOT NULL REFERENCES offerings(id),
  session_date  DATE        NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  status        TEXT        NOT NULL
                CHECK (status IN ('booked', 'attended', 'cancelled', 'late_cancelled', 'no_show', 'returned')),
  walk_in       BOOLEAN     NOT NULL DEFAULT false,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE class_card_visits IS
  'One class taken from a class card. booked/attended/late_cancelled/no_show use a class; cancelled (in time) and returned (given back by the admin) do not.';
CREATE INDEX idx_class_card_visits_tenant ON class_card_visits(tenant_id);
CREATE INDEX idx_class_card_visits_card ON class_card_visits(card_id);
CREATE INDEX idx_class_card_visits_person ON class_card_visits(person_id);
CREATE INDEX idx_class_card_visits_session ON class_card_visits(offering_id, session_date);
CREATE INDEX idx_class_card_visits_created_by ON class_card_visits(created_by);
-- One place per person per class session.
CREATE UNIQUE INDEX uq_class_card_visits_live ON class_card_visits(person_id, offering_id, session_date)
  WHERE status IN ('booked', 'attended');

CREATE TRIGGER trigger_class_card_visits_updated_at
  BEFORE UPDATE ON class_card_visits
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

-- Can the signed-in client use this card (own card, or shared in their account)?
CREATE OR REPLACE FUNCTION private.class_card_is_holder(p_card class_cards)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(p_card.tenant_id = get_my_tenant_id() AND (
           p_card.person_id = get_my_person_id()
           OR p_card.person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()))
           OR (p_card.account_id IS NOT NULL AND p_card.account_id IN (SELECT get_my_account_ids()))), false);
$$;
REVOKE EXECUTE ON FUNCTION private.class_card_is_holder(class_cards) FROM PUBLIC, anon, authenticated;

ALTER TABLE class_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_super_admin ON class_cards FOR ALL USING (is_super_admin());
CREATE POLICY cc_staff_read ON class_cards FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid())
       AND ('tenant_admin' = ANY(role) OR 'staff' = ANY(role))));
CREATE POLICY cc_holder_read ON class_cards FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND (
    person_id = get_my_person_id()
    OR person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()))
    OR (account_id IS NOT NULL AND account_id IN (SELECT get_my_account_ids()))));
-- Writes only through the functions below.
GRANT SELECT ON TABLE class_cards TO authenticated;
GRANT ALL ON TABLE class_cards TO service_role;

ALTER TABLE class_card_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccv_super_admin ON class_card_visits FOR ALL USING (is_super_admin());
CREATE POLICY ccv_staff_read ON class_card_visits FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid())
       AND ('tenant_admin' = ANY(role) OR 'staff' = ANY(role))));
CREATE POLICY ccv_holder_read ON class_card_visits FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND card_id IN (SELECT id FROM class_cards));
GRANT SELECT ON TABLE class_card_visits TO authenticated;
GRANT ALL ON TABLE class_card_visits TO service_role;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
-- Classes still on the card.
CREATE OR REPLACE FUNCTION private.class_card_classes_left(p_card_id UUID)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.class_count - (
    SELECT count(*)::int FROM class_card_visits v
     WHERE v.card_id = c.id AND v.status IN ('booked', 'attended', 'late_cancelled', 'no_show'))
  FROM class_cards c WHERE c.id = p_card_id;
$$;
REVOKE EXECUTE ON FUNCTION private.class_card_classes_left(UUID) FROM PUBLIC, anon, authenticated;

-- When a class session starts (studio time), or NULL if the class doesn't run that day.
CREATE OR REPLACE FUNCTION private.class_session_starts_at(p_offering_id UUID, p_date DATE)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem'
       FROM offering_sessions os
      WHERE os.offering_id = p_offering_id AND os.session_date = p_date
      ORDER BY os.start_time LIMIT 1),
    (SELECT (p_date + o.start_time) AT TIME ZONE 'Asia/Jerusalem'
       FROM offerings o
       LEFT JOIN seasons s ON s.id = o.season_id
      WHERE o.id = p_offering_id
        AND o.offering_type = 'class'
        AND o.day_of_week = EXTRACT(DOW FROM p_date)::int
        AND (s.id IS NULL OR p_date BETWEEN s.start_date AND s.end_date)));
$$;
REVOKE EXECUTE ON FUNCTION private.class_session_starts_at(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- Places taken in one class session: enrolled students plus card holders.
CREATE OR REPLACE FUNCTION private.class_session_places_taken(p_offering_id UUID, p_date DATE)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (SELECT count(*)::int FROM engagements e
           WHERE e.offering_id = p_offering_id AND e.status = 'active')
       + (SELECT count(*)::int FROM class_card_visits v
           WHERE v.offering_id = p_offering_id AND v.session_date = p_date
             AND v.status IN ('booked', 'attended'));
$$;
REVOKE EXECUTE ON FUNCTION private.class_session_places_taken(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- Shared checks for taking a class from a card. Locks the card row.
-- Returns the session start. Raises a short code the app turns into words.
CREATE OR REPLACE FUNCTION private.class_card_take(
  p_card_id UUID, p_offering_id UUID, p_session_date DATE, p_person_id UUID, p_walk_in BOOLEAN)
RETURNS class_card_visits LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_card     class_cards%ROWTYPE;
  v_starts   TIMESTAMPTZ;
  v_capacity INT;
  v_visit    class_card_visits%ROWTYPE;
  v_today    DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: not_found'; END IF;
  IF NOT private.class_cards_enabled(v_card.tenant_id) THEN RAISE EXCEPTION 'class_card: switched_off'; END IF;
  IF v_card.status <> 'active' THEN RAISE EXCEPTION 'class_card: not_active'; END IF;
  IF v_card.valid_until IS NOT NULL AND (p_session_date > v_card.valid_until OR v_today > v_card.valid_until) THEN
    RAISE EXCEPTION 'class_card: expired';
  END IF;
  IF p_session_date < v_card.starts_on THEN RAISE EXCEPTION 'class_card: not_started'; END IF;

  -- Who comes: the holder, or (shared card) someone in the same family account.
  IF p_person_id <> v_card.person_id AND NOT (
       v_card.account_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM people p WHERE p.id = p_person_id AND p.account_id = v_card.account_id)) THEN
    RAISE EXCEPTION 'class_card: not_this_person';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM class_card_type_offerings t
                  WHERE t.card_type_id = v_card.card_type_id AND t.offering_id = p_offering_id) THEN
    RAISE EXCEPTION 'class_card: class_not_covered';
  END IF;

  v_starts := private.class_session_starts_at(p_offering_id, p_session_date);
  IF v_starts IS NULL OR NOT EXISTS (
       SELECT 1 FROM offerings o WHERE o.id = p_offering_id AND o.tenant_id = v_card.tenant_id AND o.status <> 'cancelled') THEN
    RAISE EXCEPTION 'class_card: no_class_that_day';
  END IF;
  IF NOT p_walk_in AND v_starts <= now() THEN RAISE EXCEPTION 'class_card: already_started'; END IF;

  IF private.class_card_classes_left(p_card_id) <= 0 THEN RAISE EXCEPTION 'class_card: no_classes_left'; END IF;

  -- Booking online respects the class size; a walk-in the teacher lets in does not.
  IF NOT p_walk_in THEN
    SELECT max_capacity INTO v_capacity FROM offerings WHERE id = p_offering_id FOR UPDATE;
    IF private.class_session_places_taken(p_offering_id, p_session_date) >= v_capacity THEN
      RAISE EXCEPTION 'class_card: class_full';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM class_card_visits v
              WHERE v.person_id = p_person_id AND v.offering_id = p_offering_id
                AND v.session_date = p_session_date AND v.status IN ('booked', 'attended')) THEN
    RAISE EXCEPTION 'class_card: already_booked';
  END IF;

  INSERT INTO class_card_visits (tenant_id, card_id, person_id, offering_id, session_date, starts_at, status, walk_in, created_by)
  VALUES (v_card.tenant_id, p_card_id, p_person_id, p_offering_id, p_session_date, v_starts,
          CASE WHEN p_walk_in THEN 'attended' ELSE 'booked' END, p_walk_in, auth.uid())
  RETURNING * INTO v_visit;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_card.tenant_id, auth.uid(),
          CASE WHEN p_walk_in THEN 'class_card.walk_in' ELSE 'class_card.booked' END,
          'class_card', p_card_id,
          jsonb_build_object('visit_id', v_visit.id, 'offering_id', p_offering_id, 'session_date', p_session_date));
  RETURN v_visit;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.class_card_take(UUID, UUID, DATE, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Admin sells a card (paid at the studio, or a gift). PR 2 adds online purchase.
CREATE OR REPLACE FUNCTION issue_class_card(p_card_type_id UUID, p_person_id UUID, p_payment_id UUID DEFAULT NULL)
RETURNS class_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type   class_card_types%ROWTYPE;
  v_person people%ROWTYPE;
  v_card   class_cards%ROWTYPE;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT * INTO v_type FROM class_card_types WHERE id = p_card_type_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: type_not_found'; END IF;
  IF NOT private.class_cards_is_admin(v_type.tenant_id) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT private.class_cards_enabled(v_type.tenant_id) THEN RAISE EXCEPTION 'class_card: switched_off'; END IF;
  IF NOT v_type.is_active THEN RAISE EXCEPTION 'class_card: type_not_active'; END IF;

  SELECT * INTO v_person FROM people WHERE id = p_person_id AND tenant_id = v_type.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: person_not_found'; END IF;
  IF p_payment_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM payments WHERE id = p_payment_id AND tenant_id = v_type.tenant_id) THEN
    RAISE EXCEPTION 'class_card: payment_not_found';
  END IF;

  INSERT INTO class_cards (tenant_id, card_type_id, person_id, account_id, name, class_count, price_minor, currency,
                           status, starts_on, valid_until, payment_id, created_by)
  VALUES (v_type.tenant_id, v_type.id, v_person.id,
          CASE WHEN v_type.shareable THEN v_person.account_id END,
          v_type.name, v_type.class_count, v_type.price_minor, v_type.currency,
          'active', v_today,
          CASE WHEN v_type.valid_months IS NOT NULL THEN (v_today + make_interval(months => v_type.valid_months))::date END,
          p_payment_id, auth.uid())
  RETURNING * INTO v_card;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_card.tenant_id, auth.uid(), 'class_card.issued', 'class_card', v_card.id,
          jsonb_build_object('person_id', v_card.person_id, 'card_type_id', v_type.id, 'payment_id', p_payment_id));
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION issue_class_card(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION issue_class_card(UUID, UUID, UUID) TO authenticated;

-- Client (or admin) books a place. p_person_id: who comes (shared cards); default the holder.
CREATE OR REPLACE FUNCTION book_class_with_card(
  p_card_id UUID, p_offering_id UUID, p_session_date DATE, p_person_id UUID DEFAULT NULL)
RETURNS class_card_visits LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card class_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: not_found'; END IF;
  IF NOT (private.class_card_is_holder(v_card) OR private.class_cards_is_admin(v_card.tenant_id)) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN private.class_card_take(p_card_id, p_offering_id, p_session_date,
                                 COALESCE(p_person_id, v_card.person_id), false);
END;
$$;
REVOKE ALL ON FUNCTION book_class_with_card(UUID, UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_class_with_card(UUID, UUID, DATE, UUID) TO authenticated;

-- Teacher or admin ticks in a card holder on the register. A booked place becomes
-- attended; a walk-in takes a class (class size not checked: the teacher let them in).
CREATE OR REPLACE FUNCTION check_in_with_class_card(
  p_card_id UUID, p_offering_id UUID, p_session_date DATE, p_person_id UUID DEFAULT NULL)
RETURNS class_card_visits LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card  class_cards%ROWTYPE;
  v_visit class_card_visits%ROWTYPE;
  v_who   UUID;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: not_found'; END IF;
  IF NOT private.class_cards_is_staff(v_card.tenant_id) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_who := COALESCE(p_person_id, v_card.person_id);

  SELECT * INTO v_visit FROM class_card_visits
   WHERE card_id = p_card_id AND person_id = v_who AND offering_id = p_offering_id
     AND session_date = p_session_date AND status IN ('booked', 'no_show')
   FOR UPDATE;
  IF FOUND THEN
    UPDATE class_card_visits SET status = 'attended' WHERE id = v_visit.id RETURNING * INTO v_visit;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_card.tenant_id, auth.uid(), 'class_card.attended', 'class_card', p_card_id,
            jsonb_build_object('visit_id', v_visit.id));
    RETURN v_visit;
  END IF;

  RETURN private.class_card_take(p_card_id, p_offering_id, p_session_date, v_who, true);
END;
$$;
REVOKE ALL ON FUNCTION check_in_with_class_card(UUID, UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_in_with_class_card(UUID, UUID, DATE, UUID) TO authenticated;

-- Client (or admin) cancels a booked place. Before the studio's cutoff the class
-- goes back on the card; after it, the class counts as used (the admin can give it back).
CREATE OR REPLACE FUNCTION cancel_class_card_booking(p_visit_id UUID)
RETURNS class_card_visits LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_visit  class_card_visits%ROWTYPE;
  v_card   class_cards%ROWTYPE;
  v_cutoff INT;
BEGIN
  SELECT * INTO v_visit FROM class_card_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: visit_not_found'; END IF;
  SELECT * INTO v_card FROM class_cards WHERE id = v_visit.card_id;
  IF NOT (private.class_card_is_holder(v_card) OR private.class_cards_is_admin(v_card.tenant_id)) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_visit.status <> 'booked' THEN RAISE EXCEPTION 'class_card: not_booked'; END IF;

  v_cutoff := COALESCE((SELECT cancel_cutoff_hours FROM tenant_class_card_settings WHERE tenant_id = v_card.tenant_id), 12);
  UPDATE class_card_visits
     SET status = CASE WHEN now() <= v_visit.starts_at - make_interval(hours => v_cutoff)
                       THEN 'cancelled' ELSE 'late_cancelled' END
   WHERE id = p_visit_id
  RETURNING * INTO v_visit;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_card.tenant_id, auth.uid(), 'class_card.' || v_visit.status, 'class_card', v_card.id,
          jsonb_build_object('visit_id', v_visit.id));
  RETURN v_visit;
END;
$$;
REVOKE ALL ON FUNCTION cancel_class_card_booking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_class_card_booking(UUID) TO authenticated;

-- Teacher or admin marks a no-show; the admin gives a class back ('returned').
-- p_status: 'no_show' (staff) or 'returned' (admin only).
CREATE OR REPLACE FUNCTION set_class_card_visit_status(p_visit_id UUID, p_status TEXT)
RETURNS class_card_visits LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_visit  class_card_visits%ROWTYPE;
  v_before TEXT;
BEGIN
  SELECT * INTO v_visit FROM class_card_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: visit_not_found'; END IF;
  v_before := v_visit.status;

  IF p_status = 'no_show' THEN
    IF NOT private.class_cards_is_staff(v_visit.tenant_id) THEN
      RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_visit.status NOT IN ('booked', 'attended') THEN RAISE EXCEPTION 'class_card: not_booked'; END IF;
  ELSIF p_status = 'returned' THEN
    IF NOT private.class_cards_is_admin(v_visit.tenant_id) THEN
      RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_visit.status NOT IN ('booked', 'attended', 'late_cancelled', 'no_show') THEN
      RAISE EXCEPTION 'class_card: nothing_to_give_back';
    END IF;
  ELSE
    RAISE EXCEPTION 'class_card: bad_status';
  END IF;

  UPDATE class_card_visits SET status = p_status WHERE id = p_visit_id RETURNING * INTO v_visit;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (v_visit.tenant_id, auth.uid(), 'class_card.' || p_status, 'class_card', v_visit.card_id,
          jsonb_build_object('status', v_before), jsonb_build_object('visit_id', v_visit.id, 'status', p_status));
  RETURN v_visit;
END;
$$;
REVOKE ALL ON FUNCTION set_class_card_visit_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_class_card_visit_status(UUID, TEXT) TO authenticated;

-- Client asks once for more time on a card that expires.
CREATE OR REPLACE FUNCTION request_class_card_extension(p_card_id UUID)
RETURNS class_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card class_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: not_found'; END IF;
  IF NOT private.class_card_is_holder(v_card) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_card.status <> 'active' OR v_card.valid_until IS NULL THEN RAISE EXCEPTION 'class_card: cannot_extend'; END IF;
  IF v_card.extended_at IS NOT NULL OR v_card.extension_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'class_card: already_asked';
  END IF;

  UPDATE class_cards SET extension_requested_at = now() WHERE id = p_card_id RETURNING * INTO v_card;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_card.tenant_id, auth.uid(), 'class_card.extension_requested', 'class_card', p_card_id, '{}'::jsonb);
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION request_class_card_extension(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_class_card_extension(UUID) TO authenticated;

-- Admin extends a card once, by the studio's extension length. Works on a card
-- that has already expired (counted from today then).
CREATE OR REPLACE FUNCTION extend_class_card(p_card_id UUID)
RETURNS class_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card   class_cards%ROWTYPE;
  v_months INT;
  v_before DATE;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_card: not_found'; END IF;
  IF NOT private.class_cards_is_admin(v_card.tenant_id) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_card.status <> 'active' OR v_card.valid_until IS NULL THEN RAISE EXCEPTION 'class_card: cannot_extend'; END IF;
  IF v_card.extended_at IS NOT NULL THEN RAISE EXCEPTION 'class_card: already_extended'; END IF;

  v_months := COALESCE((SELECT extension_months FROM tenant_class_card_settings WHERE tenant_id = v_card.tenant_id), 3);
  v_before := v_card.valid_until;
  UPDATE class_cards
     SET valid_until = (GREATEST(valid_until, v_today) + make_interval(months => v_months))::date,
         extended_at = now()
   WHERE id = p_card_id
  RETURNING * INTO v_card;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (v_card.tenant_id, auth.uid(), 'class_card.extended', 'class_card', p_card_id,
          jsonb_build_object('valid_until', v_before), jsonb_build_object('valid_until', v_card.valid_until));
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION extend_class_card(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION extend_class_card(UUID) TO authenticated;

-- The signed-in client's cards with classes left (for the portal).
CREATE OR REPLACE FUNCTION get_my_class_cards()
RETURNS TABLE (id UUID, person_id UUID, name TEXT, class_count INT, classes_left INT, status TEXT,
               starts_on DATE, valid_until DATE, shared BOOLEAN, extension_requested_at TIMESTAMPTZ,
               extended_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.person_id, c.name, c.class_count, private.class_card_classes_left(c.id), c.status,
         c.starts_on, c.valid_until, c.account_id IS NOT NULL, c.extension_requested_at, c.extended_at
    FROM class_cards c
   WHERE private.class_cards_enabled(c.tenant_id)
     AND c.status <> 'cancelled'
     AND private.class_card_is_holder(c)
   ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION get_my_class_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_class_cards() TO authenticated;

-- Admin view of one person's cards with classes left.
CREATE OR REPLACE FUNCTION get_person_class_cards(p_person_id UUID)
RETURNS TABLE (id UUID, name TEXT, class_count INT, classes_left INT, status TEXT, starts_on DATE,
               valid_until DATE, shared BOOLEAN, extension_requested_at TIMESTAMPTZ, extended_at TIMESTAMPTZ,
               payment_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM people WHERE people.id = p_person_id;
  IF v_tenant IS NULL OR NOT private.class_cards_is_staff(v_tenant) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.class_count, private.class_card_classes_left(c.id), c.status, c.starts_on,
         c.valid_until, c.account_id IS NOT NULL, c.extension_requested_at, c.extended_at,
         c.payment_id, c.created_at
    FROM class_cards c
   WHERE c.person_id = p_person_id
      OR (c.account_id IS NOT NULL AND c.account_id = (SELECT account_id FROM people WHERE people.id = p_person_id))
   ORDER BY c.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION get_person_class_cards(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_person_class_cards(UUID) TO authenticated;
