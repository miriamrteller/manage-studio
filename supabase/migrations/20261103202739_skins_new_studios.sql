-- =============================================================================
-- A new studio (or a studio moved to another skin) must use a LIVE skin. The
-- set-up wizard only offers live skins; this stops a hand-made request from
-- creating a studio on a draft. Covers provision_studio, provision_tenant and
-- any direct insert. A studio already on a skin that is later set back to
-- draft is unaffected (only a change of skin is checked).
-- =============================================================================
CREATE OR REPLACE FUNCTION guard_tenant_skin_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.skin IS DISTINCT FROM OLD.skin)
     AND NOT EXISTS (SELECT 1 FROM verticals v WHERE v.id = NEW.skin AND v.status = 'live') THEN
    RAISE EXCEPTION 'Skin is not live: %', NEW.skin
      USING ERRCODE = 'check_violation',
            HINT = 'Set the skin to live on /platform/skins first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_guard_skin_live ON tenants;
CREATE TRIGGER tenants_guard_skin_live
  BEFORE INSERT OR UPDATE OF skin ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_skin_live();

-- =============================================================================
-- A new studio's enquiry form starts with its skin's chosen ready-made
-- questions (verticals.enquiry_presets), switched on and optional. Only when
-- the studio has no form settings yet; the owner changes them in Settings.
-- =============================================================================
CREATE OR REPLACE FUNCTION apply_skin_enquiry_presets()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_presets TEXT[];
BEGIN
  IF NEW.lead_form IS NOT NULL AND NEW.lead_form <> '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  SELECT enquiry_presets INTO v_presets FROM verticals WHERE id = NEW.skin;
  IF coalesce(cardinality(v_presets), 0) = 0 THEN
    RETURN NEW;
  END IF;
  NEW.lead_form := jsonb_build_object(
    'presets', (SELECT jsonb_object_agg(k, jsonb_build_object('enabled', true, 'required', false)) FROM unnest(v_presets) AS k),
    'custom', '[]'::jsonb,
    -- Offered beyond the studio kind's usual set (see leadForm.ts presetKeysFor).
    'extra', to_jsonb(v_presets)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_apply_skin_enquiry_presets ON tenants;
CREATE TRIGGER tenants_apply_skin_enquiry_presets
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION apply_skin_enquiry_presets();
