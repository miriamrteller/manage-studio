-- =============================================================================
-- 20261110160300: Class cards in the client portal (plan docs/plans/CLASS-CARDS.md).
-- One read for a card holder: the coming class sessions their card covers, with
-- places left and their own booking, plus the studio's cancel cutoff.
-- ADDITIVE MIGRATION: one new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_my_class_card_sessions(p_card_id UUID, p_days INT DEFAULT 14)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card   class_cards%ROWTYPE;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_last   DATE;
BEGIN
  SELECT * INTO v_card FROM class_cards WHERE id = p_card_id;
  IF NOT FOUND OR NOT (private.class_card_is_holder(v_card) OR private.class_cards_is_admin(v_card.tenant_id)) THEN
    RAISE EXCEPTION 'class_card: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT private.class_cards_enabled(v_card.tenant_id) THEN
    RAISE EXCEPTION 'class_card: switched_off';
  END IF;

  v_last := v_today + LEAST(GREATEST(COALESCE(p_days, 14), 1), 60) - 1;
  IF v_card.valid_until IS NOT NULL THEN v_last := LEAST(v_last, v_card.valid_until); END IF;

  RETURN jsonb_build_object(
    'cancel_cutoff_hours',
      COALESCE((SELECT cancel_cutoff_hours FROM tenant_class_card_settings WHERE tenant_id = v_card.tenant_id), 12),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'offering_id', s.offering_id, 'name', s.name, 'location', s.location,
               'session_date', s.d, 'starts_at', s.starts_at, 'is_session', s.is_session,
               'places_left', GREATEST(s.max_capacity - private.class_session_places_taken(s.offering_id, s.d), 0),
               'visit_id', v.id, 'visit_status', v.status, 'visit_person_id', v.person_id)
             ORDER BY s.starts_at)
        FROM (
          SELECT o.id AS offering_id, o.name, o.location, o.max_capacity, g.d::date AS d,
                 private.class_session_starts_at(o.id, g.d::date) AS starts_at,
                 EXISTS (SELECT 1 FROM offering_sessions os WHERE os.offering_id = o.id AND os.session_date = g.d::date) AS is_session
            FROM class_card_type_offerings t
            JOIN offerings o ON o.id = t.offering_id AND o.status <> 'cancelled'
           CROSS JOIN generate_series(GREATEST(v_today, v_card.starts_on), v_last, interval '1 day') AS g(d)
           WHERE t.card_type_id = v_card.card_type_id
        ) s
        LEFT JOIN LATERAL (
          SELECT cv.id, cv.status, cv.person_id FROM class_card_visits cv
           WHERE cv.card_id = v_card.id AND cv.offering_id = s.offering_id AND cv.session_date = s.d
             AND cv.status IN ('booked', 'attended', 'late_cancelled', 'no_show')
           ORDER BY (cv.status IN ('booked', 'attended')) DESC, cv.created_at DESC
           LIMIT 1) v ON true
       WHERE s.starts_at IS NOT NULL AND s.starts_at > now()), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION get_my_class_card_sessions(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_class_card_sessions(UUID, INT) TO authenticated;
