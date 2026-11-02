-- =============================================================================
-- Enquiry-form questions per studio (docs/plans/LEADS.md, step 2b)
--
-- tenants.lead_form: which ready-made questions are on, plus up to 5 custom
-- questions. Shape and limits: packages/shared/src/leadForm.ts
-- (parseLeadFormConfig); the DB only checks it is a bounded JSON object.
--
-- leads: answers that the pipeline uses get real columns —
--   child_name, child_birth_date  (dance/classes; matching to a student later)
--   event_date                    (photographers; the shoot date)
--   offering_id                   (already exists; "class of interest")
-- Everything else goes to leads.answers: { "<key>": { label, value, display? } }.
--
-- Public read: get_lead_form(tenant) returns only the questions (no secrets).
-- ADDITIVE: new columns with defaults, one new function.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN lead_form JSONB NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT tenants_lead_form_shape
    CHECK (jsonb_typeof(lead_form) = 'object' AND pg_column_size(lead_form) <= 32768);

COMMENT ON COLUMN tenants.lead_form IS
  'Enquiry-form questions: { presets: { <key>: { enabled, required } }, custom: [ { id, type, label: {en,he}, required, options? } ] }. See packages/shared/src/leadForm.ts.';

-- Column-level SELECT on tenants (002700_grants.sql) does not cover new columns.
-- Admins read it through RLS ("users see own tenant") and save it under
-- "admins update own tenant".
GRANT SELECT (lead_form) ON TABLE public.tenants TO authenticated;

ALTER TABLE leads
  ADD COLUMN child_name TEXT
    CHECK (child_name IS NULL OR char_length(child_name) BETWEEN 1 AND 200),
  ADD COLUMN child_birth_date DATE,
  ADD COLUMN event_date DATE,
  ADD COLUMN answers JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT leads_answers_shape
      CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) <= 20000);

COMMENT ON COLUMN leads.child_name IS 'From the enquiry form (ready-made question, classes).';
COMMENT ON COLUMN leads.child_birth_date IS 'From the enquiry form (ready-made question, classes).';
COMMENT ON COLUMN leads.event_date IS 'From the enquiry form (ready-made question, photographers).';
COMMENT ON COLUMN leads.answers IS
  'Other enquiry-form answers: { "<key>": { label: {en,he}, value, display? } }. Labels are copied so a lead keeps them after the studio edits its form.';

-- -----------------------------------------------------------------------------
-- Public read of a studio's questions (anon visitors on /inquire, /embed/inquire).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_lead_form(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.lead_form FROM tenants t WHERE t.id = p_tenant_id;
$$;

-- Tier: public (supabase/security/definer-execute.json).
REVOKE ALL ON FUNCTION get_lead_form(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_lead_form(UUID) TO anon, authenticated;
