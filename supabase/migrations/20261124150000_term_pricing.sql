-- =============================================================================
-- Term pricing with automatic discounts (owner decision, 24 Nov 2026).
--
-- "60 and 70 per class, either get cards or full term or spread with the calculation written
-- out for parents to see on the enrolment/payment". A class with a price per class is paid by
-- the term: (classes left in the term, without holidays and closed dates) × price per class,
-- either up front with the studio's discount or in equal monthly payments (one per month with
-- a class, rounded). Discounts are automatic, never typed in by hand:
--   * early enrolment ("Founding Families"): enrolled by a date -> the early price per class,
--     kept for terms starting until a second date;
--   * sisters: a percentage off from the Nth girl of the family (default the second);
--   * a paid trial class (a payment for the studio's trial offering) comes off the first payment.
-- Logic: packages/shared/src/termPricing.ts (pure) and _shared/payments/term-price.ts (loader).
--
--   offerings.price_per_class_minor / early_price_per_class_minor  (NULL = old monthly price)
--   tenant_term_pricing: one row per studio (no row = no discounts, ₪5 rounding)
--   engagements.pay_plan + term_price: the plan the family picked and the price it was shown
--   billing_schedules.last_period: no monthly payment after this month; then 'completed'
--
-- ADDITIVE. Nothing changes for a class without a price per class.
-- =============================================================================

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS price_per_class_minor INT
    CHECK (price_per_class_minor IS NULL OR price_per_class_minor > 0),
  ADD COLUMN IF NOT EXISTS early_price_per_class_minor INT
    CHECK (early_price_per_class_minor IS NULL OR early_price_per_class_minor > 0);

COMMENT ON COLUMN offerings.price_per_class_minor IS
  'Term pricing: price of one class (gross, minor units). Set = families pay classes left in the term × this, up front or monthly. NULL = price_minor per month.';
COMMENT ON COLUMN offerings.early_price_per_class_minor IS
  'Term pricing: price of one class for families who enrolled by tenant_term_pricing.early_enrol_by.';

CREATE TABLE IF NOT EXISTS tenant_term_pricing (
  tenant_id             UUID         PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  upfront_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (upfront_discount_pct BETWEEN 0 AND 50),
  round_minor           INT          NOT NULL DEFAULT 500 CHECK (round_minor BETWEEN 1 AND 10000),
  early_enrol_by        DATE,
  early_until           DATE,
  sibling_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (sibling_discount_pct BETWEEN 0 AND 50),
  sibling_from          INT          NOT NULL DEFAULT 2 CHECK (sibling_from BETWEEN 2 AND 10),
  trial_offering_id     UUID         REFERENCES offerings(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_term_pricing IS
  'Term pricing rules of a studio: up-front discount, rounding, early-enrolment dates, sister discount and the trial offering whose payment comes off the first payment.';

CREATE TRIGGER trigger_tenant_term_pricing_updated_at
  BEFORE UPDATE ON tenant_term_pricing
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE tenant_term_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY ttp_super_admin ON tenant_term_pricing FOR ALL USING (is_super_admin());
CREATE POLICY ttp_tenant_read ON tenant_term_pricing FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY ttp_admin_insert ON tenant_term_pricing FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
CREATE POLICY ttp_admin_update ON tenant_term_pricing FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id());
REVOKE ALL ON TABLE tenant_term_pricing FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE tenant_term_pricing TO authenticated;
GRANT ALL ON TABLE tenant_term_pricing TO service_role;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS pay_plan TEXT CHECK (pay_plan IS NULL OR pay_plan IN ('monthly', 'upfront')),
  ADD COLUMN IF NOT EXISTS term_price JSONB
    CHECK (term_price IS NULL OR (jsonb_typeof(term_price) = 'object' AND pg_column_size(term_price) <= 8192));

COMMENT ON COLUMN engagements.pay_plan IS
  'Term pricing: the family''s choice, monthly payments or the whole term up front (NULL = not a term-priced class).';
COMMENT ON COLUMN engagements.term_price IS
  'Term pricing: the calculation shown to the family when they picked the plan (classes, price per class, discounts, payments).';

ALTER TABLE billing_schedules
  ADD COLUMN IF NOT EXISTS last_period TEXT
    CHECK (last_period IS NULL OR last_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
COMMENT ON COLUMN billing_schedules.last_period IS
  'Term pricing: the last month (YYYY-MM) with a monthly payment; after it the plan is completed.';

ALTER TABLE billing_schedules DROP CONSTRAINT IF EXISTS billing_schedules_status_check;
ALTER TABLE billing_schedules ADD CONSTRAINT billing_schedules_status_check
  CHECK (status IN ('active', 'paused', 'suspended', 'cancelled', 'completed'));
