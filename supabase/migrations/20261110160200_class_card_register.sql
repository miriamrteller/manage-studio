-- =============================================================================
-- 20261110160200: Class cards, the register (plan docs/plans/CLASS-CARDS.md).
-- One read for the teacher's register of a class session: the card holders who
-- booked or came, and the cards that could be used for a walk-in.
-- ADDITIVE MIGRATION: one new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_class_card_register(p_offering_id UUID, p_session_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT tenant_id INTO v_tenant FROM offerings WHERE id = p_offering_id;
  IF v_tenant IS NULL OR NOT private.class_cards_is_staff(v_tenant) THEN
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
