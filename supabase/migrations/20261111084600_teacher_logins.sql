-- =============================================================================
-- 20261111084600: Teacher logins.
--
-- A studio admin adds a teacher (staff row) with an email. When that person
-- signs in to the studio with that email (confirmed by the email code), the app
-- calls link_my_teacher_login(): the staff row is linked to their login and
-- their profile gets the 'staff' role. Changing the teacher's email or removing
-- the teacher unlinks the login and takes the role away again.
--
-- Which classes a teacher sees is a studio setting (owner, 11 Nov 2026):
-- tenants.teachers_own_classes_only, off by default. Off: every class of the
-- studio. On: only classes they teach (offerings.staff_id = their staff row).
--   - offering_sessions / attendance: the old 'staff' policies let any staff
--     login change and delete every session of the studio. Teachers now read
--     sessions and mark attendance, for the classes the setting allows.
--   - staff: signed-in parents and clients no longer read the staff table (it
--     holds teacher emails, phones and pay). Teacher names stay readable for the
--     studio through the staff_names view. A teacher reads their own row.
--   - get_my_teaching(): the teacher's "My classes" page in one read.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Studio setting: teachers see only their own classes (default off).
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS teachers_own_classes_only BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tenants.teachers_own_classes_only IS
  'true = a teacher sees and takes the register only for classes they teach; false (default) = every class of the studio.';
GRANT SELECT (teachers_own_classes_only) ON TABLE tenants TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS helper: may the caller, as a teacher, see this class?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher_for_offering(p_offering_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT COALESCE((
    SELECT true
      FROM offerings o
      JOIN tenants t ON t.id = o.tenant_id
      JOIN staff s ON s.tenant_id = o.tenant_id AND s.user_profile_id = auth.uid()
     WHERE o.id = p_offering_id
       AND (NOT t.teachers_own_classes_only OR o.staff_id = s.id)
     LIMIT 1), false)
$$;
COMMENT ON FUNCTION public.is_teacher_for_offering(UUID) IS
  'True when the caller is a linked teacher of the offering''s studio and the studio setting lets them see it (all classes, or only their own). RLS helper.';
REVOKE ALL ON FUNCTION public.is_teacher_for_offering(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_teacher_for_offering(UUID) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep the 'staff' role in step with linked staff rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_teacher_role(p_profile_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF p_profile_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM staff WHERE user_profile_id = p_profile_id) THEN
    UPDATE user_profiles SET role = array_append(role, 'staff'), updated_at = now()
     WHERE id = p_profile_id AND NOT ('staff' = ANY(role));
  ELSE
    UPDATE user_profiles SET role = array_remove(role, 'staff'), updated_at = now()
     WHERE id = p_profile_id AND 'staff' = ANY(role);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_teacher_role(UUID) FROM PUBLIC, anon, authenticated;

-- Before a staff row is written: the login link (user_profile_id) is set only by
-- link_my_teacher_login(), never typed in by an admin; a changed email unlinks.
CREATE OR REPLACE FUNCTION private.staff_login_guard()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.teacher_link', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_profile_id := NULL;
    ELSE
      NEW.user_profile_id := OLD.user_profile_id;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(NEW.email, '')) IS DISTINCT FROM lower(COALESCE(OLD.email, '')) THEN
    NEW.user_profile_id := NULL;
  END IF;
  NEW.email := NULLIF(trim(NEW.email), '');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.staff_login_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.staff_login_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.sync_teacher_role(OLD.user_profile_id);
    RETURN OLD;
  END IF;
  IF OLD.user_profile_id IS DISTINCT FROM NEW.user_profile_id THEN
    PERFORM private.sync_teacher_role(OLD.user_profile_id);
    PERFORM private.sync_teacher_role(NEW.user_profile_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.staff_login_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_login_guard ON staff;
CREATE TRIGGER trg_staff_login_guard
  BEFORE INSERT OR UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION private.staff_login_guard();

DROP TRIGGER IF EXISTS trg_staff_login_after ON staff;
CREATE TRIGGER trg_staff_login_after
  AFTER UPDATE OR DELETE ON staff
  FOR EACH ROW EXECUTE FUNCTION private.staff_login_after();

-- ---------------------------------------------------------------------------
-- link_my_teacher_login(): called by the app after sign-in.
-- Links the caller to the staff rows of their studio that carry their confirmed
-- email. Returns true when the caller is a teacher of their studio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_my_teacher_login()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
  v_email  TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT tenant_id INTO v_tenant FROM user_profiles WHERE id = v_uid;
  IF v_tenant IS NULL THEN RETURN false; END IF;

  SELECT lower(email) INTO v_email
    FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    PERFORM set_config('app.teacher_link', 'on', true);
    UPDATE staff SET user_profile_id = v_uid, updated_at = now()
     WHERE tenant_id = v_tenant
       AND user_profile_id IS NULL
       AND lower(email) = v_email;
    PERFORM set_config('app.teacher_link', '', true);
  END IF;

  PERFORM private.sync_teacher_role(v_uid);
  RETURN EXISTS (SELECT 1 FROM staff WHERE user_profile_id = v_uid AND tenant_id = v_tenant);
END;
$$;
COMMENT ON FUNCTION public.link_my_teacher_login() IS
  'After sign-in: links the caller to their studio''s staff rows with the same confirmed email and keeps the staff role in step. Returns true for a teacher.';
REVOKE ALL ON FUNCTION public.link_my_teacher_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_teacher_login() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_my_teaching(): the classes the signed-in teacher sees.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_teaching()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH me AS (
    SELECT s.id FROM staff s
     WHERE s.user_profile_id = auth.uid() AND s.tenant_id = get_my_tenant_id()
  )
  SELECT jsonb_build_object(
    'teacher_names', COALESCE((
      SELECT jsonb_agg(s.name ORDER BY s.name) FROM staff s WHERE s.id IN (SELECT id FROM me)), '[]'::jsonb),
    'own_classes_only', COALESCE((
      SELECT teachers_own_classes_only FROM tenants WHERE id = get_my_tenant_id()), false),
    'classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id,
               'name', o.name,
               'day_of_week', o.day_of_week,
               'start_time', o.start_time,
               'end_time', o.end_time,
               'location', o.location,
               'status', o.status,
               'season_name', se.name,
               'teacher_name', st.name,
               'mine', COALESCE(o.staff_id IN (SELECT id FROM me), false),
               'enrolled', (SELECT count(*) FROM engagements e
                             WHERE e.offering_id = o.id AND e.status = 'active'))
             ORDER BY COALESCE(o.staff_id IN (SELECT id FROM me), false) DESC,
                      o.day_of_week NULLS LAST, o.start_time NULLS LAST, o.name)
        FROM offerings o
        LEFT JOIN seasons se ON se.id = o.season_id
        LEFT JOIN staff st ON st.id = o.staff_id
       WHERE EXISTS (SELECT 1 FROM me)
         AND o.tenant_id = get_my_tenant_id()
         AND o.offering_type = 'class'
         AND o.status <> 'cancelled'
         AND (se.id IS NULL OR se.status IN ('upcoming', 'active'))
         AND is_teacher_for_offering(o.id)), '[]'::jsonb)
  )
$$;
COMMENT ON FUNCTION public.get_my_teaching() IS
  'The classes the signed-in teacher sees (studio setting: all, or only their own), not cancelled, current or upcoming season, with the number enrolled. Own classes first.';
REVOKE ALL ON FUNCTION public.get_my_teaching() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_teaching() TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies: teachers read sessions and mark attendance for the classes they see.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff manage sessions" ON public.offering_sessions;
CREATE POLICY "teachers read sessions" ON public.offering_sessions FOR SELECT
  USING (tenant_id = (SELECT get_my_tenant_id()) AND is_teacher_for_offering(offering_id));

DROP POLICY IF EXISTS "staff mark attendance" ON public.attendance;
CREATE POLICY "teachers mark attendance" ON public.attendance FOR ALL
  USING (tenant_id = (SELECT get_my_tenant_id()) AND session_id IN (
    SELECT id FROM offering_sessions WHERE is_teacher_for_offering(offering_id)))
  WITH CHECK (tenant_id = (SELECT get_my_tenant_id()) AND session_id IN (
    SELECT id FROM offering_sessions WHERE is_teacher_for_offering(offering_id)));

-- staff: no more reading by every signed-in person of the studio.
DROP POLICY IF EXISTS "authenticated read staff" ON public.staff;
CREATE POLICY "teachers read own staff row" ON public.staff FOR SELECT
  USING (user_profile_id = (SELECT auth.uid()));

-- Teacher names for the studio's own people (no email, phone or pay).
CREATE OR REPLACE VIEW public.staff_names AS
  SELECT id, tenant_id, name FROM public.staff WHERE tenant_id = get_my_tenant_id();
COMMENT ON VIEW public.staff_names IS
  'Teacher names of the caller''s studio. Runs as the view owner, filtered to get_my_tenant_id().';
REVOKE ALL ON public.staff_names FROM PUBLIC, anon;
GRANT SELECT ON public.staff_names TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_my_profile(): the app's profile read now links a teacher first, so a
-- teacher's very first sign-in already lands on My classes. Same result as
-- before for everyone else (link_my_teacher_login changes nothing for them).
-- VOLATILE because linking writes; supabase.rpc calls it with POST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public AS $$
BEGIN
  PERFORM public.link_my_teacher_login();
  RETURN QUERY SELECT * FROM public.user_profiles WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- The register (20261111081600_class_attendance.sql): admins, and teachers for
-- the classes the studio setting lets them see.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_take_register(p_offering_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT private.class_cards_is_admin(o.tenant_id)
                     FROM offerings o WHERE o.id = p_offering_id), false)
      OR public.is_teacher_for_offering(p_offering_id);
$$;
REVOKE EXECUTE ON FUNCTION private.can_take_register(UUID) FROM PUBLIC, anon, authenticated;
