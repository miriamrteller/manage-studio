-- =============================================================================
-- 20261111075500: Attendance for every class.
-- The teacher takes the register for one class date: each enrolled student is
-- marked here or not here. Class card holders keep their own register
-- (class_card_visits), shown on the same screen.
--
-- `attendance` was keyed only by offering_sessions, which weekly classes do not
-- have. A row can now name the class and the date instead.
-- ADDITIVE MIGRATION: new columns, one helper, two functions. No rows change.
-- =============================================================================

ALTER TABLE attendance ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE attendance ADD COLUMN offering_id  UUID REFERENCES offerings(id);
ALTER TABLE attendance ADD COLUMN session_date DATE;
ALTER TABLE attendance ADD COLUMN marked_by    UUID REFERENCES user_profiles(id);
ALTER TABLE attendance ADD CONSTRAINT attendance_session_or_class_date CHECK (
  session_id IS NOT NULL OR (offering_id IS NOT NULL AND session_date IS NOT NULL));

CREATE UNIQUE INDEX attendance_class_date_person
  ON attendance (offering_id, session_date, person_id) WHERE offering_id IS NOT NULL;
CREATE INDEX idx_attendance_offering_date ON attendance (offering_id, session_date);

COMMENT ON COLUMN attendance.offering_id IS
  'The class, for a register taken by class and date (weekly classes have no offering_sessions row).';
COMMENT ON COLUMN attendance.session_date IS 'The class date (studio time), with offering_id.';

CREATE TRIGGER trigger_attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

-- Who may take the register for a class. One place, so it can be narrowed
-- later (for example, teachers to their own classes).
CREATE OR REPLACE FUNCTION private.can_take_register(p_offering_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT private.class_cards_is_staff(o.tenant_id)
                     FROM offerings o WHERE o.id = p_offering_id), false);
$$;
REVOKE EXECUTE ON FUNCTION private.can_take_register(UUID) FROM PUBLIC, anon, authenticated;

-- The register: enrolled students (active), plus anyone already marked that
-- day who has since left the class. attended is true, false or null (not marked).
CREATE OR REPLACE FUNCTION get_class_register(p_offering_id UUID, p_session_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'attendance: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'runs', private.class_session_starts_at(p_offering_id, p_session_date) IS NOT NULL,
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'person_id', s.person_id, 'name', p.name, 'enrolled', s.enrolled,
               'attended', a.attended)
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

-- Mark one or more students here (true), not here (false), or clear the mark
-- (null). Only students enrolled in the class (any status) can be marked.
-- Returns how many rows were set.
CREATE OR REPLACE FUNCTION set_class_attendance(
  p_offering_id UUID, p_session_date DATE, p_person_ids UUID[], p_attended BOOLEAN)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_count  INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM offerings WHERE id = p_offering_id;
  IF v_tenant IS NULL OR NOT private.can_take_register(p_offering_id) THEN
    RAISE EXCEPTION 'attendance: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF private.class_session_starts_at(p_offering_id, p_session_date) IS NULL THEN
    RAISE EXCEPTION 'attendance: no_class_that_day';
  END IF;
  IF p_person_ids IS NULL OR cardinality(p_person_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_person_ids) AS pid
     WHERE NOT EXISTS (SELECT 1 FROM engagements e
                        WHERE e.offering_id = p_offering_id AND e.person_id = pid)) THEN
    RAISE EXCEPTION 'attendance: not_in_class';
  END IF;

  IF p_attended IS NULL THEN
    DELETE FROM attendance
     WHERE offering_id = p_offering_id AND session_date = p_session_date
       AND person_id = ANY (p_person_ids);
  ELSE
    INSERT INTO attendance (tenant_id, offering_id, session_date, person_id, attended, marked_by)
    SELECT DISTINCT v_tenant, p_offering_id, p_session_date, pid, p_attended, auth.uid()
      FROM unnest(p_person_ids) AS pid
    ON CONFLICT (offering_id, session_date, person_id) WHERE offering_id IS NOT NULL
    DO UPDATE SET attended = EXCLUDED.attended, marked_by = EXCLUDED.marked_by;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION set_class_attendance(UUID, DATE, UUID[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_class_attendance(UUID, DATE, UUID[], BOOLEAN) TO authenticated;
