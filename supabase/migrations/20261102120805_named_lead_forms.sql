-- =============================================================================
-- Named enquiry forms (docs/plans/LEADS.md, step 2d)
--
-- A studio can publish several forms at https://<sub>.opalswift.com/f/<slug>
-- (and /embed/f/<slug> for websites), e.g. /f/grade2 or /f/kotelshoot. Each has
-- its own title and intro (en + he), optional image, a subset of the studio's
-- questions (tenants.lead_form), an optional pre-selected class or package, an
-- on/off switch and an optional last day. /inquire stays the general form.
-- Leads record which form they came from (leads.form_id).
--
-- Slug rules mirror packages/shared/src/leadForm.ts (formSlugProblem).
-- "Open" = active AND (ends_on IS NULL OR ends_on >= today in Israel).
-- ADDITIVE: new table, one nullable FK on leads, one public definer function.
-- =============================================================================

CREATE TABLE lead_forms (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          TEXT        NOT NULL
                CONSTRAINT lead_forms_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$')
                CONSTRAINT lead_forms_slug_reserved CHECK (slug NOT IN (
                  'new', 'edit', 'admin', 'api', 'embed', 'inquire', 'f', 'form', 'forms',
                  'settings', 'default', 'all', 'www', 'app', 'login', 'signup', 'null', 'undefined')),
  name          TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  title_en      TEXT        CHECK (title_en IS NULL OR char_length(title_en) <= 120),
  title_he      TEXT        CHECK (title_he IS NULL OR char_length(title_he) <= 120),
  intro_en      TEXT        CHECK (intro_en IS NULL OR char_length(intro_en) <= 600),
  intro_he      TEXT        CHECK (intro_he IS NULL OR char_length(intro_he) <= 600),
  image_url     TEXT        CHECK (image_url IS NULL OR (image_url ~ '^https://' AND char_length(image_url) <= 1000)),
  -- Which of the studio's questions this form asks (preset keys and c_<id>).
  -- NULL = every question the studio has switched on.
  question_keys TEXT[]      CHECK (question_keys IS NULL OR cardinality(question_keys) <= 20),
  offering_id   UUID        REFERENCES offerings(id) ON DELETE SET NULL,
  active        BOOLEAN     NOT NULL DEFAULT true,
  ends_on       DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lead_forms_slug_unique UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE lead_forms IS
  'Named enquiry forms at /f/<slug>. Public read only through get_named_lead_form(). See docs/plans/LEADS.md (2d).';

CREATE INDEX idx_lead_forms_tenant ON lead_forms(tenant_id);

-- The pre-selected offering must belong to the same studio.
CREATE OR REPLACE FUNCTION lead_forms_check_offering()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.offering_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM offerings o WHERE o.id = NEW.offering_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'lead_forms.offering_id must belong to the same studio' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lead_forms_check_offering
  BEFORE INSERT OR UPDATE ON lead_forms
  FOR EACH ROW EXECUTE FUNCTION lead_forms_check_offering();

ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY;

-- Staff-only, like leads.
CREATE POLICY lead_forms_super_admin ON lead_forms FOR ALL USING (is_super_admin());
CREATE POLICY lead_forms_admin_manage ON lead_forms FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_forms TO authenticated;
GRANT ALL ON TABLE public.lead_forms TO service_role;

-- Which form a lead came from (first touch). The form may be deleted later.
ALTER TABLE leads ADD COLUMN form_id UUID REFERENCES lead_forms(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_form ON leads(form_id) WHERE form_id IS NOT NULL;

-- A lead's form must belong to the lead's studio.
CREATE OR REPLACE FUNCTION leads_check_form()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.form_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lead_forms f WHERE f.id = NEW.form_id AND f.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'leads.form_id must belong to the same studio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_check_form
  BEFORE INSERT OR UPDATE OF form_id ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_check_form();

-- -----------------------------------------------------------------------------
-- Public read for /f/<slug> and /embed/f/<slug>.
--   unknown slug            → NULL
--   off or past its last day → { "status": "closed" }   (no details)
--   open                    → { "status": "open", id, slug, title/intro, image_url,
--                               question_keys, offering_id }
-- The internal name is never returned.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_named_lead_form(p_tenant_id UUID, p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN f.active AND (f.ends_on IS NULL OR f.ends_on >= (now() AT TIME ZONE 'Asia/Jerusalem')::date)
    THEN jsonb_build_object(
      'status', 'open',
      'id', f.id,
      'slug', f.slug,
      'title_en', f.title_en, 'title_he', f.title_he,
      'intro_en', f.intro_en, 'intro_he', f.intro_he,
      'image_url', f.image_url,
      'question_keys', to_jsonb(f.question_keys),
      'offering_id', f.offering_id)
    ELSE jsonb_build_object('status', 'closed')
  END
  FROM lead_forms f
  WHERE f.tenant_id = p_tenant_id AND f.slug = lower(trim(p_slug));
$$;

-- Tier: public (supabase/security/definer-execute.json).
REVOKE ALL ON FUNCTION get_named_lead_form(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_named_lead_form(UUID, TEXT) TO anon, authenticated;
