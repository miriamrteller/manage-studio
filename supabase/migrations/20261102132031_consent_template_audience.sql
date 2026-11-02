-- Health declarations come in two versions: a child's (signed by a parent or
-- guardian) and an adult's. A studio with both ages keeps both active; the
-- signing flows pick the one that fits the participant's age.
--
-- consent_templates.audience: 'child' | 'adult' | NULL (one form for everyone,
-- as every studio has had until now). pick_active_consent_template() is the one
-- place that chooses: the participant's age match first, then a form for
-- everyone, then any active form, so studios with a single active form behave
-- exactly as before.

ALTER TABLE public.consent_templates
  ADD COLUMN IF NOT EXISTS audience TEXT CHECK (audience IN ('child', 'adult'));

COMMENT ON COLUMN public.consent_templates.audience IS
  'Who signs this version: child (a guardian signs for a participant under 18), adult, or NULL (everyone).';

CREATE OR REPLACE FUNCTION public.pick_active_consent_template(p_tenant_id UUID, p_person_id UUID)
RETURNS SETOF public.consent_templates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audience TEXT;
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

  RETURN QUERY
  SELECT ct.*
  FROM consent_templates ct
  WHERE ct.tenant_id = p_tenant_id AND ct.status = 'active'
  ORDER BY CASE
             WHEN ct.audience IS NOT DISTINCT FROM v_audience THEN 0
             WHEN ct.audience IS NULL THEN 1
             ELSE 2
           END,
           ct.updated_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.pick_active_consent_template(UUID, UUID) IS
  'The active form a participant signs: the child or adult version by age, else the studio''s single form.';

REVOKE ALL ON FUNCTION public.pick_active_consent_template(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_active_consent_template(UUID, UUID) TO authenticated, service_role;

-- Every studio type now gets forms at creation (general studios the base
-- service agreement), so going live needs an active form whatever the type.
CREATE OR REPLACE FUNCTION public.acknowledge_studio_legal_pack(
  p_version  TEXT,
  p_language TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_tenant  UUID;
  v_headers JSONB;
  v_ip      INET;
  v_ua      TEXT;
  v_now     TIMESTAMPTZ := now();
BEGIN
  SELECT up.tenant_id INTO v_tenant
  FROM user_profiles up
  WHERE up.id = v_uid AND up.tenant_id IS NOT NULL AND 'tenant_admin' = ANY (up.role);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can acknowledge the legal pack';
  END IF;
  IF p_version IS NULL OR length(trim(p_version)) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'version is required';
  END IF;
  IF p_language NOT IN ('he', 'en') THEN
    RAISE EXCEPTION 'language must be he or en';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    BEGIN
      v_ip := split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)::inet;
    EXCEPTION WHEN others THEN
      v_ip := NULL;
    END;
    v_ua := left(v_headers->>'user-agent', 512);
  END IF;

  INSERT INTO legal_acceptances (tenant_id, user_id, document, document_version, language, accepted_by_role, ip_address, user_agent)
  VALUES (v_tenant, v_uid, 'studio_legal_pack', trim(p_version), p_language, 'tenant_admin', v_ip, v_ua);

  -- Every studio type now has forms (health declarations or a service
  -- agreement): none can go live without an active one.
  IF NOT EXISTS (SELECT 1 FROM consent_templates ct WHERE ct.tenant_id = v_tenant AND ct.status = 'active') THEN
    RAISE EXCEPTION 'signed_template_missing';
  END IF;

  UPDATE tenants
  SET legal_pack_acknowledged_at = v_now, legal_pages_published = true
  WHERE id = v_tenant;

  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) IS
  'A studio admin acknowledges the draft legal pack: records it and publishes the legal pages. Refuses while the studio has no active signed form.';

REVOKE ALL ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) TO authenticated;
