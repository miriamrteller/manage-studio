-- Automatic thank-you email to each new sign-up from the studio's website form.
--
-- tenants.lead_thank_you = { enabled, subject_en, body_en, subject_he, body_he }.
-- Off ('{}') until the studio switches it on in Leads -> Enquiry settings, so
-- no studio starts sending a new email by surprise. crm-lead-capture sends it
-- (service email) when a NEW lead with an email arrives, in the language the
-- visitor used; a repeat sign-up from the same email does not get it again.
-- See supabase/functions/_shared/crm-contract/lead-thank-you.ts.

ALTER TABLE tenants
  ADD COLUMN lead_thank_you JSONB NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT tenants_lead_thank_you_shape
    CHECK (jsonb_typeof(lead_thank_you) = 'object' AND pg_column_size(lead_thank_you) <= 32768);

COMMENT ON COLUMN tenants.lead_thank_you IS
  'Thank-you email to new website sign-ups: { enabled, subject_en, body_en, subject_he, body_he }; {name} and {studio} are filled in. See supabase/functions/_shared/crm-contract/lead-thank-you.ts.';

-- Column-level SELECT on tenants (002700_grants.sql) does not cover new columns.
-- Admins read it through RLS ("users see own tenant") and save it under
-- "admins update own tenant".
GRANT SELECT (lead_thank_you) ON TABLE public.tenants TO authenticated;
