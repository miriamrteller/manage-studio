-- =============================================================================
-- 20261115091000: Teachers: own classes only, and "cash collected".
--
-- Owner, 15 Nov 2026: only the admin cancels or reassigns; a teacher sees only
-- their own classes and takes the register; a teacher can note that a pupil paid
-- in cash, but that does not mark them paid until the admin does.
--
--   * tenants.teachers_own_classes_only now defaults to true, and every studio is
--     switched to it (no studio had changed it and no teacher had signed in yet).
--     The studio can still switch it off on the Teachers page.
--   * Class card register (get_class_card_register, check_in_with_class_card,
--     no-show in set_class_card_visit_status) follows the same rule as the
--     class register (private.can_take_register), not "any teacher of the studio".
--   * class_cash_notes: "cash collected" notes from the register. Waiting until
--     the admin marks the payment paid (recorded through the usual payment
--     screens) or "not received". A note is never a payment.
--   * set_cash_collected / clear_cash_collected (register), get_cash_to_confirm
--     and resolve_cash_note (admin).
--   * get_class_register: each pupil carries their cash note for that date, and
--     the class price (to prefill the amount).
--
-- ADDITIVE MIGRATION: one table, one default and value change, functions replaced.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Teachers see only their own classes, by default.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ALTER COLUMN teachers_own_classes_only SET DEFAULT true;
UPDATE tenants SET teachers_own_classes_only = true WHERE NOT teachers_own_classes_only;
COMMENT ON COLUMN tenants.teachers_own_classes_only IS
  'true (default) = a teacher sees and takes the register only for classes they teach; false = every class of the studio.';

-- ---------------------------------------------------------------------------
-- Class card register: same rule as the class register.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_class_card_register(p_offering_id UUID, p_session_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT tenant_id INTO v_tenant FROM offerings WHERE id = p_offering_id;
  IF v_tenant IS NULL OR NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'runs', private.class_session_starts_at(p_offering_id, p_session_date) IS NOT NULL,
    'visits', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'visit_id', v.id, 'card_id', v.card_id, 'person_id', v.person_id, 'name', p.name,
               'card_name', c.name, 'status', v.status, 'walk_in', v.walk_in)
             ORDER BY p.name)
        FROM class_card_visits v
        JOIN people p ON p.id = v.person_id
        JOIN class_cards c ON c.id = v.card_id
       WHERE v.offering_id = p_offering_id AND v.session_date = p_session_date
         AND v.status IN ('booked', 'attended', 'no_show', 'late_cancelled')), '[]'::jsonb),
    'cards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'card_id', c.id, 'person_id', c.person_id, 'name', p.name, 'card_name', c.name,
               'classes_left', private.class_card_classes_left(c.id), 'valid_until', c.valid_until)
             ORDER BY p.name)
        FROM class_cards c
        JOIN people p ON p.id = c.person_id
       WHERE c.tenant_id = v_tenant
         AND c.status = 'active'
         AND (c.valid_until IS NULL OR (c.valid_until >= v_today AND c.valid_until >= p_session_date))
         AND (c.starts_on IS NULL OR c.starts_on <= p_session_date)
         AND EXISTS (SELECT 1 FROM class_card_type_offerings t
                      WHERE t.card_type_id = c.card_type_id AND t.offering_id = p_offering_id)
         AND private.class_card_classes_left(c.id) > 0), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION get_class_card_register(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_class_card_register(UUID, DATE) TO authenticated;

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
  IF NOT private.can_take_register(p_offering_id)
     OR v_card.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM offerings WHERE id = p_offering_id) THEN
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
    IF NOT private.can_take_register(v_visit.offering_id) THEN
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

-- ---------------------------------------------------------------------------
-- "Cash collected" notes.
-- ---------------------------------------------------------------------------
CREATE TABLE class_cash_notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  offering_id   UUID        NOT NULL REFERENCES offerings(id),
  session_date  DATE        NOT NULL,
  person_id     UUID        NOT NULL REFERENCES people(id),
  amount_minor  INT         CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency      TEXT        NOT NULL DEFAULT 'ILS',
  note          TEXT        CHECK (note IS NULL OR char_length(note) <= 500),
  recorded_by   UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'paid', 'not_received')),
  resolved_by   UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  payment_id    UUID        REFERENCES payments(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE class_cash_notes IS
  'A teacher''s note from the register that a pupil paid in cash. Not a payment: it waits until the admin records the payment (paid) or marks it not received.';
CREATE UNIQUE INDEX class_cash_notes_one_waiting
  ON class_cash_notes (offering_id, session_date, person_id) WHERE status = 'waiting';
CREATE INDEX idx_class_cash_notes_tenant_status ON class_cash_notes (tenant_id, status, created_at DESC);
CREATE INDEX idx_class_cash_notes_person ON class_cash_notes (person_id);
CREATE INDEX idx_class_cash_notes_offering ON class_cash_notes (offering_id);
CREATE INDEX idx_class_cash_notes_recorded_by ON class_cash_notes (recorded_by);
CREATE INDEX idx_class_cash_notes_resolved_by ON class_cash_notes (resolved_by);
CREATE INDEX idx_class_cash_notes_payment ON class_cash_notes (payment_id);

CREATE TRIGGER trigger_class_cash_notes_updated_at
  BEFORE UPDATE ON class_cash_notes
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE class_cash_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE class_cash_notes FROM anon, authenticated;
GRANT SELECT ON TABLE class_cash_notes TO authenticated;
GRANT ALL ON TABLE class_cash_notes TO service_role;
-- Changes go through the functions below. Admins read their studio's notes;
-- a teacher reads the notes they wrote.
CREATE POLICY "admins read cash notes" ON class_cash_notes FOR SELECT TO authenticated
  USING (tenant_id = (SELECT get_my_tenant_id()) AND (SELECT is_my_studio_admin()));
CREATE POLICY "teachers read own cash notes" ON class_cash_notes FOR SELECT TO authenticated
  USING (recorded_by = (SELECT auth.uid()));

-- Register: note that a pupil paid in cash (or change the note). Returns the note id.
CREATE OR REPLACE FUNCTION set_cash_collected(
  p_offering_id UUID, p_session_date DATE, p_person_id UUID,
  p_amount_minor INT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offering offerings%ROWTYPE;
  v_id       UUID;
BEGIN
  SELECT * INTO v_offering FROM offerings WHERE id = p_offering_id;
  IF NOT FOUND OR NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'cash: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_session_date IS NULL THEN RAISE EXCEPTION 'cash: no_date'; END IF;
  IF p_amount_minor IS NOT NULL AND p_amount_minor <= 0 THEN RAISE EXCEPTION 'cash: bad_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM engagements e WHERE e.offering_id = p_offering_id AND e.person_id = p_person_id)
     AND NOT EXISTS (SELECT 1 FROM class_card_visits v
                      WHERE v.offering_id = p_offering_id AND v.session_date = p_session_date
                        AND v.person_id = p_person_id) THEN
    RAISE EXCEPTION 'cash: not_in_class';
  END IF;

  INSERT INTO class_cash_notes (tenant_id, offering_id, session_date, person_id, amount_minor, currency, note, recorded_by)
  VALUES (v_offering.tenant_id, p_offering_id, p_session_date, p_person_id, p_amount_minor,
          v_offering.currency, NULLIF(btrim(left(p_note, 500)), ''), auth.uid())
  ON CONFLICT (offering_id, session_date, person_id) WHERE status = 'waiting'
  DO UPDATE SET amount_minor = EXCLUDED.amount_minor, note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by
  RETURNING id INTO v_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_offering.tenant_id, auth.uid(), 'cash_note.recorded', 'class_cash_note', v_id,
          jsonb_build_object('person_id', p_person_id, 'offering_id', p_offering_id,
                             'session_date', p_session_date, 'amount_minor', p_amount_minor));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION set_cash_collected(UUID, DATE, UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_cash_collected(UUID, DATE, UUID, INT, TEXT) TO authenticated;

-- Register: take back a waiting note (tapped by mistake). Returns whether one was removed.
CREATE OR REPLACE FUNCTION clear_cash_collected(p_offering_id UUID, p_session_date DATE, p_person_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note class_cash_notes%ROWTYPE;
BEGIN
  IF NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'cash: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM class_cash_notes
   WHERE offering_id = p_offering_id AND session_date = p_session_date AND person_id = p_person_id
     AND status = 'waiting'
  RETURNING * INTO v_note;
  IF v_note.id IS NULL THEN RETURN false; END IF;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state)
  VALUES (v_note.tenant_id, auth.uid(), 'cash_note.cleared', 'class_cash_note', v_note.id,
          jsonb_build_object('person_id', v_note.person_id, 'amount_minor', v_note.amount_minor));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION clear_cash_collected(UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION clear_cash_collected(UUID, DATE, UUID) TO authenticated;

-- Admin: the cash notes still waiting, oldest first.
CREATE OR REPLACE FUNCTION get_cash_to_confirm()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := get_my_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT is_my_studio_admin() THEN
    RAISE EXCEPTION 'cash: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', n.id, 'person_id', n.person_id, 'person_name', p.name,
             'offering_id', n.offering_id, 'class_name', o.name, 'session_date', n.session_date,
             'amount_minor', n.amount_minor, 'currency', n.currency, 'note', n.note,
             'teacher_name', COALESCE(s.name, rp.name), 'created_at', n.created_at)
           ORDER BY n.session_date, n.created_at)
      FROM class_cash_notes n
      JOIN people p ON p.id = n.person_id
      JOIN offerings o ON o.id = n.offering_id
      LEFT JOIN staff s ON s.tenant_id = n.tenant_id AND s.user_profile_id = n.recorded_by
      LEFT JOIN user_profiles up ON up.id = n.recorded_by
      LEFT JOIN people rp ON rp.id = up.person_id
     WHERE n.tenant_id = v_tenant AND n.status = 'waiting'), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION get_cash_to_confirm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cash_to_confirm() TO authenticated;

-- Admin: close a waiting note. 'paid' after the payment was recorded (payment id
-- when known), or 'not_received'.
CREATE OR REPLACE FUNCTION resolve_cash_note(p_note_id UUID, p_outcome TEXT, p_payment_id UUID DEFAULT NULL)
RETURNS class_cash_notes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note class_cash_notes%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('paid', 'not_received') THEN RAISE EXCEPTION 'cash: bad_outcome'; END IF;
  SELECT * INTO v_note FROM class_cash_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND OR v_note.tenant_id IS DISTINCT FROM get_my_tenant_id() OR NOT is_my_studio_admin() THEN
    RAISE EXCEPTION 'cash: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_note.status <> 'waiting' THEN RAISE EXCEPTION 'cash: already_closed'; END IF;
  IF p_payment_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM payments WHERE id = p_payment_id AND tenant_id = v_note.tenant_id) THEN
    RAISE EXCEPTION 'cash: payment_not_found';
  END IF;

  UPDATE class_cash_notes
     SET status = p_outcome, resolved_by = auth.uid(), resolved_at = now(),
         payment_id = CASE WHEN p_outcome = 'paid' THEN p_payment_id END
   WHERE id = p_note_id
  RETURNING * INTO v_note;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_note.tenant_id, auth.uid(), 'cash_note.' || p_outcome, 'class_cash_note', v_note.id,
          jsonb_build_object('payment_id', v_note.payment_id));
  RETURN v_note;
END;
$$;
REVOKE ALL ON FUNCTION resolve_cash_note(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_cash_note(UUID, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- The register: each pupil's cash note for the date, and the class price.
-- cash: null, or { status: 'waiting' | 'paid', amount_minor, note }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_class_register(p_offering_id UUID, p_session_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'attendance: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'runs', private.class_session_starts_at(p_offering_id, p_session_date) IS NOT NULL,
    'price_minor', (SELECT NULLIF(price_minor, 0) FROM offerings WHERE id = p_offering_id),
    'currency', (SELECT currency FROM offerings WHERE id = p_offering_id),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'person_id', s.person_id, 'name', p.name, 'enrolled', s.enrolled,
               'attended', a.attended,
               'cash', (SELECT jsonb_build_object('status', n.status, 'amount_minor', n.amount_minor, 'note', n.note)
                          FROM class_cash_notes n
                         WHERE n.offering_id = p_offering_id AND n.session_date = p_session_date
                           AND n.person_id = s.person_id AND n.status IN ('waiting', 'paid')
                         ORDER BY (n.status = 'waiting') DESC, n.created_at DESC
                         LIMIT 1))
             ORDER BY p.name)
        FROM (
          SELECT person_id, bool_or(enrolled) AS enrolled FROM (
            SELECT e.person_id, true AS enrolled
              FROM engagements e
             WHERE e.offering_id = p_offering_id AND e.status = 'active'
            UNION ALL
            SELECT a2.person_id, false
              FROM attendance a2
             WHERE a2.offering_id = p_offering_id AND a2.session_date = p_session_date
          ) x GROUP BY person_id
        ) s
        JOIN people p ON p.id = s.person_id
        LEFT JOIN attendance a
          ON a.offering_id = p_offering_id AND a.session_date = p_session_date
         AND a.person_id = s.person_id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION get_class_register(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_class_register(UUID, DATE) TO authenticated;
