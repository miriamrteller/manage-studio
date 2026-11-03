-- =============================================================================
-- "Clients sign a health declaration": a studio setting.
--
-- tenants.health_declaration: true / false, or NULL = from the studio's field
-- (the skin's default_switches.health_declaration; for the built-in skins only
-- dance studios, as today). Existing studios stay NULL, so nothing changes for
-- them. New studios get it from the set-up wizard, prefilled from the field.
-- Insurance questions and the health forms follow it (app and seeding).
--
-- Like the other business-profile settings it changes only through
-- set_business_profile() (audited); the guard trigger refuses direct updates.
-- set_business_profile() gains a parameter, so the old signature is dropped.
--
-- get_tenant_legal_profile() also returns the setting, the skin's default and
-- the skin's legal add-on (verticals.legal_addon), so the legal pages and forms
-- follow the field. Same inputs, grants and tier (public).
-- =============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS health_declaration BOOLEAN;
COMMENT ON COLUMN tenants.health_declaration IS
  'Clients sign a health declaration. NULL = from the field (the skin''s default_switches.health_declaration; built-in skins: dance studios only). Change it with set_business_profile().';

-- ── Guard: the setting changes only through the setter ──────────────────────
CREATE OR REPLACE FUNCTION guard_tenant_business_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.payment_flow       IS DISTINCT FROM OLD.payment_flow
       OR NEW.teaches_classes    IS DISTINCT FROM OLD.teaches_classes
       OR NEW.family_accounts    IS DISTINCT FROM OLD.family_accounts
       OR NEW.client_booking     IS DISTINCT FROM OLD.client_booking
       OR NEW.health_declaration IS DISTINCT FROM OLD.health_declaration) THEN
    RAISE EXCEPTION 'business_profile_use_setter'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Change the business profile with set_business_profile().';
  END IF;
  RETURN NEW;
END;
$$;

-- ── set_business_profile: one more setting ─────────────────────────────────
-- A NULL argument leaves that setting as it is.
DROP FUNCTION IF EXISTS set_business_profile(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN);
CREATE FUNCTION set_business_profile(
  p_tenant_id          UUID,
  p_payment_flow       TEXT    DEFAULT NULL,
  p_teaches_classes    BOOLEAN DEFAULT NULL,
  p_family_accounts    BOOLEAN DEFAULT NULL,
  p_client_booking     BOOLEAN DEFAULT NULL,
  p_health_declaration BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
  v_after  JSONB;
BEGIN
  -- is_super_admin() is NULL for anonymous callers.
  IF NOT COALESCE(is_super_admin(), false) AND (
       auth.uid() IS NULL
       OR p_tenant_id IS DISTINCT FROM get_my_tenant_id()
       OR NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_payment_flow IS NOT NULL AND p_payment_flow NOT IN ('recurring', 'project', 'both') THEN
    RAISE EXCEPTION 'payment_flow must be recurring, project or both';
  END IF;

  SELECT jsonb_build_object('payment_flow', payment_flow, 'teaches_classes', teaches_classes,
                            'family_accounts', family_accounts, 'client_booking', client_booking,
                            'health_declaration', health_declaration)
    INTO v_before FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  UPDATE tenants SET
    payment_flow       = COALESCE(p_payment_flow, payment_flow),
    teaches_classes    = COALESCE(p_teaches_classes, teaches_classes),
    family_accounts    = COALESCE(p_family_accounts, family_accounts),
    client_booking     = COALESCE(p_client_booking, client_booking),
    health_declaration = COALESCE(p_health_declaration, health_declaration),
    updated_at         = now()
  WHERE id = p_tenant_id
  RETURNING jsonb_build_object('payment_flow', payment_flow, 'teaches_classes', teaches_classes,
                               'family_accounts', family_accounts, 'client_booking', client_booking,
                               'health_declaration', health_declaration)
    INTO v_after;

  IF v_after IS DISTINCT FROM v_before THEN
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (p_tenant_id, auth.uid(), 'UPDATE', 'business_profile', p_tenant_id, v_before, v_after);
  END IF;

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION set_business_profile(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_business_profile(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- ── get_tenant_legal_profile: the setting and the field's legal choices ─────
DROP FUNCTION IF EXISTS public.get_tenant_legal_profile(UUID);
CREATE FUNCTION public.get_tenant_legal_profile(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id                  UUID,
  name                       TEXT,
  contact_email              TEXT,
  skin                       TEXT,
  legal_profile              JSONB,
  legal_pages_published      BOOLEAN,
  legal_profile_updated_at   TIMESTAMPTZ,
  legal_pack_required        BOOLEAN,
  legal_pack_acknowledged_at TIMESTAMPTZ,
  language_default           TEXT,
  legal_pack_ack_drafts      TEXT[],
  teaches_classes            BOOLEAN,
  health_declaration         BOOLEAN,
  skin_health_declaration    BOOLEAN,
  skin_legal_addon           TEXT,
  skin_name_en               TEXT,
  skin_name_he               TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.contact_email, t.skin, t.legal_profile,
         t.legal_pages_published, t.legal_profile_updated_at,
         t.legal_pack_required, t.legal_pack_acknowledged_at, t.language_default,
         t.legal_pack_ack_drafts, coalesce(t.teaches_classes, true),
         t.health_declaration,
         CASE jsonb_typeof(v.default_switches->'health_declaration')
           WHEN 'boolean' THEN (v.default_switches->>'health_declaration')::boolean
         END,
         v.legal_addon, v.name_en, v.name_he
  FROM tenants t
  LEFT JOIN verticals v ON v.id = t.skin
  WHERE t.id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.get_tenant_legal_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_legal_profile(UUID) TO anon, authenticated;
