-- Each signed form now exists in Hebrew and English, so a parent signs in the
-- language they use the app in, whatever the studio's default language.
--
-- consent_templates.language: 'he' | 'en', or NULL (written in the studio's
-- language, as every form was until now). pick_active_consent_template() takes
-- the reader's language and prefers, in order: the participant's audience
-- (child / adult), then the reader's language, the studio's language, a form
-- with no language, any other. Studios with a single form behave as before.

ALTER TABLE public.consent_templates
  ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('he', 'en'));

COMMENT ON COLUMN public.consent_templates.language IS
  'Language of this version: he, en, or NULL (the studio''s language).';

-- The language argument changes the signature: replace the two-argument version.
DROP FUNCTION IF EXISTS public.pick_active_consent_template(UUID, UUID);

CREATE FUNCTION public.pick_active_consent_template(
  p_tenant_id UUID,
  p_person_id UUID,
  p_language  TEXT DEFAULT NULL
)
RETURNS SETOF public.consent_templates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audience TEXT;
  v_studio_language TEXT;
BEGIN
  -- Signed-in callers only for their own studio; the service role for any.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.tenant_id = p_tenant_id) THEN
    RETURN;
  END IF;

  -- Under 18, or no date of birth (a guardian enrolling a child): the child version.
  SELECT CASE WHEN p.date_of_birth IS NULL OR is_minor(p.date_of_birth) THEN 'child' ELSE 'adult' END
    INTO v_audience
  FROM people p WHERE p.id = p_person_id AND p.tenant_id = p_tenant_id;

  SELECT t.language_default INTO v_studio_language FROM tenants t WHERE t.id = p_tenant_id;

  RETURN QUERY
  SELECT ct.*
  FROM consent_templates ct
  WHERE ct.tenant_id = p_tenant_id AND ct.status = 'active'
  ORDER BY CASE
             WHEN ct.audience IS NOT DISTINCT FROM v_audience THEN 0
             WHEN ct.audience IS NULL THEN 1
             ELSE 2
           END,
           CASE
             WHEN p_language IS NOT NULL AND ct.language = p_language THEN 0
             WHEN ct.language = v_studio_language THEN 1
             WHEN ct.language IS NULL THEN 2
             ELSE 3
           END,
           ct.updated_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.pick_active_consent_template(UUID, UUID, TEXT) IS
  'The active form a participant signs: the child or adult version by age, in the reader''s language when there is one.';

REVOKE ALL ON FUNCTION public.pick_active_consent_template(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_active_consent_template(UUID, UUID, TEXT) TO authenticated, service_role;
