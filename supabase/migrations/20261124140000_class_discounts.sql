-- =============================================================================
-- Class discounts (owner decisions, 10 Nov 2026; plan docs/plans/CLASS-DISCOUNTS-AND-SEASONS.md).
--
-- A studio switches on automatic discounts for classes: sibling (2nd child, and
-- 3rd child and more), an extra class for the same child, and early bird. They
-- add up, capped at a maximum the studio sets, or only the biggest one counts.
-- Siblings are children of the same family OR children that share a parent
-- email (24 Nov 2026). A studio can also give one client a discount by email
-- (class_discount_clients) and hand out coupon codes (class_discount_coupons)
-- that a parent types at checkout; the studio picks per coupon whether it is off
-- the first payment only (the default) or off every month.
--
-- The discount is worked out once, when the enrolment is made (trigger below),
-- and stored on the enrolment, so a later rule change or a sibling leaving never
-- changes a price the parent already saw. Every price reader (checkout, monthly
-- charges, emails) takes the class price minus engagements.discount_minor.
-- For a monthly class the discount is per month.
--
-- Classes only (offerings.offering_type = 'class'); bookings and projects are untouched.
-- Nothing changes for a studio until it switches a discount on.
-- =============================================================================

CREATE TABLE IF NOT EXISTS class_discount_settings (
  tenant_id            UUID        PRIMARY KEY REFERENCES tenants(id),
  combine_mode         TEXT        NOT NULL DEFAULT 'add_up' CHECK (combine_mode IN ('add_up', 'biggest')),
  -- The most the discounts may add up to, as a percentage of the class price.
  max_total_percent    INT         NOT NULL DEFAULT 30 CHECK (max_total_percent BETWEEN 1 AND 90),
  sibling_enabled      BOOLEAN     NOT NULL DEFAULT false,
  sibling_unit         TEXT        NOT NULL DEFAULT 'percent' CHECK (sibling_unit IN ('percent', 'amount')),
  -- 2nd child; and 3rd child and more. Percent (1-90) or an amount in minor units.
  sibling_value        INT         NOT NULL DEFAULT 10 CHECK (sibling_value > 0),
  sibling_more_value   INT         NOT NULL DEFAULT 15 CHECK (sibling_more_value > 0),
  extra_class_enabled  BOOLEAN     NOT NULL DEFAULT false,
  extra_class_unit     TEXT        NOT NULL DEFAULT 'percent' CHECK (extra_class_unit IN ('percent', 'amount')),
  extra_class_value    INT         NOT NULL DEFAULT 10 CHECK (extra_class_value > 0),
  early_bird_enabled   BOOLEAN     NOT NULL DEFAULT false,
  early_bird_unit      TEXT        NOT NULL DEFAULT 'percent' CHECK (early_bird_unit IN ('percent', 'amount')),
  early_bird_value     INT         NOT NULL DEFAULT 5 CHECK (early_bird_value > 0),
  -- Early bird ends this many days before each season starts.
  early_bird_days_before INT       NOT NULL DEFAULT 30 CHECK (early_bird_days_before BETWEEN 0 AND 365),
  updated_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_discount_percent_range CHECK (
        (sibling_unit <> 'percent' OR (sibling_value <= 90 AND sibling_more_value <= 90))
    AND (extra_class_unit <> 'percent' OR extra_class_value <= 90)
    AND (early_bird_unit <> 'percent' OR early_bird_value <= 90)
  )
);

COMMENT ON TABLE class_discount_settings IS
  'Automatic class discounts for a studio (sibling, extra class, early bird). One row per studio; no row = no discounts.';

ALTER TABLE class_discount_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_discount_settings_super_admin ON class_discount_settings FOR ALL
  USING (is_super_admin());
CREATE POLICY class_discount_settings_admin ON class_discount_settings FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
REVOKE ALL ON class_discount_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON class_discount_settings TO authenticated;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS discount_minor INT   NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN IF NOT EXISTS discount_lines JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN engagements.discount_minor IS
  'Automatic class discount off the class price, per charge (per month for monthly classes). Set once at enrolment.';
COMMENT ON COLUMN engagements.discount_lines IS
  'The discounts behind discount_minor (and first_discount_minor): [{"kind": "sibling"|"extra_class"|"early_bird"|"client"|"coupon", "amount_minor": n, "first_only"?: true, "code"?: text}].';

-- A discount for one client, matched by email (the child's own, or a parent's).
CREATE TABLE IF NOT EXISTS class_discount_clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  email       TEXT        NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  unit        TEXT        NOT NULL DEFAULT 'percent' CHECK (unit IN ('percent', 'amount')),
  value       INT         NOT NULL CHECK (value > 0),
  note        TEXT,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_discount_clients_percent_range CHECK (unit <> 'percent' OR value <= 90),
  CONSTRAINT class_discount_clients_tenant_email_key UNIQUE (tenant_id, email)
);

COMMENT ON TABLE class_discount_clients IS
  'A class discount for one client, matched on the child''s or a parent''s email when the child is enrolled.';

-- Coupon codes a parent types at checkout.
CREATE TABLE IF NOT EXISTS class_discount_coupons (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  code        TEXT        NOT NULL CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 2 AND 40),
  unit        TEXT        NOT NULL DEFAULT 'percent' CHECK (unit IN ('percent', 'amount')),
  value       INT         NOT NULL CHECK (value > 0),
  -- Off the first payment only (default), or off every monthly payment.
  applies_to  TEXT        NOT NULL DEFAULT 'first_payment' CHECK (applies_to IN ('first_payment', 'every_month')),
  valid_until DATE,
  max_uses    INT         CHECK (max_uses IS NULL OR max_uses > 0),
  active      BOOLEAN     NOT NULL DEFAULT true,
  note        TEXT,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT class_discount_coupons_percent_range CHECK (unit <> 'percent' OR value <= 90),
  CONSTRAINT class_discount_coupons_tenant_code_key UNIQUE (tenant_id, code)
);

COMMENT ON TABLE class_discount_coupons IS
  'Coupon codes for classes. A parent types one at checkout; it is checked and applied by public.apply_class_coupon.';

ALTER TABLE class_discount_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_discount_clients_super_admin ON class_discount_clients FOR ALL
  USING (is_super_admin());
CREATE POLICY class_discount_clients_admin ON class_discount_clients FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
REVOKE ALL ON class_discount_clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_discount_clients TO authenticated;

ALTER TABLE class_discount_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_discount_coupons_super_admin ON class_discount_coupons FOR ALL
  USING (is_super_admin());
CREATE POLICY class_discount_coupons_admin ON class_discount_coupons FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
REVOKE ALL ON class_discount_coupons FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_discount_coupons TO authenticated;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS coupon_id            UUID REFERENCES class_discount_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_discount_minor INT  NOT NULL DEFAULT 0 CHECK (first_discount_minor >= 0);

CREATE INDEX IF NOT EXISTS idx_engagements_coupon ON engagements(coupon_id) WHERE coupon_id IS NOT NULL;

COMMENT ON COLUMN engagements.first_discount_minor IS
  'Extra discount off the first payment only (a first-payment coupon). Monthly charges use discount_minor alone.';

-- Every email that belongs to a person's family: their own, the family's main
-- contact's, and each family member's (person and sign-in). Lower case.
CREATE OR REPLACE FUNCTION private.person_contact_emails(p_person UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(x.email))) FILTER (WHERE x.email IS NOT NULL AND btrim(x.email) <> ''), '{}')
  FROM (
    SELECT p.email FROM people p WHERE p.id = p_person
    UNION ALL
    SELECT cp.email FROM people p JOIN accounts a ON a.id = p.account_id JOIN people cp ON cp.id = a.person_id
    WHERE p.id = p_person
    UNION ALL
    SELECT mp.email FROM people p JOIN account_members m ON m.account_id = p.account_id JOIN people mp ON mp.id = m.person_id
    WHERE p.id = p_person
    UNION ALL
    SELECT u.email FROM people p JOIN account_members m ON m.account_id = p.account_id JOIN user_profiles u ON u.id = m.user_profile_id
    WHERE p.id = p_person
  ) x;
$$;

REVOKE ALL ON FUNCTION private.person_contact_emails(UUID) FROM PUBLIC, anon, authenticated;

-- One rule's amount off a price.
CREATE OR REPLACE FUNCTION private.class_discount_amount(p_base INT, p_unit TEXT, p_value INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_base <= 0 OR p_value IS NULL OR p_value <= 0 THEN 0
    WHEN p_unit = 'percent' THEN round(p_base * p_value / 100.0)::INT
    ELSE least(p_value, p_base)
  END;
$$;

-- Works out the discount for a new class enrolment. Runs as the table owner so a
-- parent's own enrolment can count the family's other enrolments.
CREATE OR REPLACE FUNCTION private.apply_class_discounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings   class_discount_settings%ROWTYPE;
  v_offering   RECORD;
  v_season     RECORD;
  v_account_id UUID;
  v_season_id  UUID;
  v_base       INT;
  v_children   INT;
  v_first      TIMESTAMPTZ;
  v_lines      JSONB := '[]'::jsonb;
  v_emails     TEXT[];
  v_amount     INT;
  v_total      INT := 0;
  v_biggest    INT := 0;
  v_cap        INT;
  v_today      DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  -- Only this trigger sets the discount; whatever the caller sent is ignored.
  NEW.discount_minor := 0;
  NEW.discount_lines := '[]'::jsonb;

  NEW.coupon_id := NULL;
  NEW.first_discount_minor := 0;

  -- No settings row: nothing automatic, but a client discount still counts (default maximum).
  SELECT * INTO v_settings FROM class_discount_settings WHERE tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN
    v_settings.combine_mode := 'add_up';
    v_settings.max_total_percent := 30;
    v_settings.sibling_enabled := false;
    v_settings.extra_class_enabled := false;
    v_settings.early_bird_enabled := false;
  END IF;
  IF NOT (v_settings.sibling_enabled OR v_settings.extra_class_enabled OR v_settings.early_bird_enabled)
     AND NOT EXISTS (SELECT 1 FROM class_discount_clients WHERE tenant_id = NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT offering_type, price_minor, season_id INTO v_offering FROM offerings WHERE id = NEW.offering_id;
  IF NOT FOUND OR v_offering.offering_type <> 'class' OR v_offering.price_minor <= 0 THEN
    RETURN NEW;
  END IF;
  v_base := v_offering.price_minor;
  v_season_id := COALESCE(NEW.season_id, v_offering.season_id);

  -- Sibling: this child is the 2nd, or 3rd and more, child of the family to enrol
  -- in a class this season. A family is the same account, or children that share
  -- a parent email. The order is set by each child's first open class enrolment
  -- in the season, so a first child's extra class is not a "sibling" one.
  v_emails := private.person_contact_emails(NEW.person_id);
  IF v_settings.sibling_enabled THEN
    SELECT account_id INTO v_account_id FROM people WHERE id = NEW.person_id;
    IF v_account_id IS NOT NULL OR cardinality(v_emails) > 0 THEN
      SELECT COALESCE(min(e.created_at), NEW.created_at) INTO v_first
      FROM engagements e
      JOIN offerings o ON o.id = e.offering_id
      WHERE e.tenant_id = NEW.tenant_id
        AND e.person_id = NEW.person_id
        AND e.status NOT IN ('cancelled', 'withdrawn')
        AND o.offering_type = 'class'
        AND COALESCE(e.season_id, o.season_id) IS NOT DISTINCT FROM v_season_id;

      SELECT count(DISTINCT e.person_id) INTO v_children
      FROM engagements e
      JOIN people p ON p.id = e.person_id
      JOIN offerings o ON o.id = e.offering_id
      WHERE e.tenant_id = NEW.tenant_id
        AND e.person_id <> NEW.person_id
        AND e.status NOT IN ('cancelled', 'withdrawn')
        AND e.created_at < v_first
        AND o.offering_type = 'class'
        AND COALESCE(e.season_id, o.season_id) IS NOT DISTINCT FROM v_season_id
        AND (
          (v_account_id IS NOT NULL AND p.account_id = v_account_id)
          OR (cardinality(v_emails) > 0 AND private.person_contact_emails(e.person_id) && v_emails)
        );
      IF v_children >= 1 THEN
        v_amount := private.class_discount_amount(
          v_base, v_settings.sibling_unit,
          CASE WHEN v_children >= 2 THEN v_settings.sibling_more_value ELSE v_settings.sibling_value END);
        IF v_amount > 0 THEN
          v_lines := v_lines || jsonb_build_object('kind', 'sibling', 'amount_minor', v_amount);
        END IF;
      END IF;
    END IF;
  END IF;

  -- Extra class: the same child already has an open class enrolment in the same season.
  IF v_settings.extra_class_enabled AND EXISTS (
    SELECT 1 FROM engagements e
    JOIN offerings o ON o.id = e.offering_id
    WHERE e.tenant_id = NEW.tenant_id
      AND e.person_id = NEW.person_id
      AND e.offering_id <> NEW.offering_id
      AND e.status NOT IN ('cancelled', 'withdrawn')
      AND o.offering_type = 'class'
      AND COALESCE(e.season_id, o.season_id) IS NOT DISTINCT FROM v_season_id
  ) THEN
    v_amount := private.class_discount_amount(v_base, v_settings.extra_class_unit, v_settings.extra_class_value);
    IF v_amount > 0 THEN
      v_lines := v_lines || jsonb_build_object('kind', 'extra_class', 'amount_minor', v_amount);
    END IF;
  END IF;

  -- Early bird: enrolled on or before the set number of days before the season starts.
  IF v_settings.early_bird_enabled AND v_season_id IS NOT NULL THEN
    SELECT start_date INTO v_season FROM seasons WHERE id = v_season_id;
    IF FOUND AND v_today <= v_season.start_date - v_settings.early_bird_days_before THEN
      v_amount := private.class_discount_amount(v_base, v_settings.early_bird_unit, v_settings.early_bird_value);
      IF v_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object('kind', 'early_bird', 'amount_minor', v_amount);
      END IF;
    END IF;
  END IF;

  -- A discount the studio gave this client: matched on the child's or a parent's email.
  -- When more than one email has one, the biggest counts.
  IF cardinality(v_emails) > 0 THEN
    SELECT max(private.class_discount_amount(v_base, c.unit, c.value)) INTO v_amount
    FROM class_discount_clients c
    WHERE c.tenant_id = NEW.tenant_id AND c.email = ANY(v_emails);
    IF COALESCE(v_amount, 0) > 0 THEN
      v_lines := v_lines || jsonb_build_object('kind', 'client', 'amount_minor', v_amount);
    END IF;
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN NEW;
  END IF;

  -- Only the biggest one counts: keep that line alone.
  IF v_settings.combine_mode = 'biggest' THEN
    SELECT max((l->>'amount_minor')::INT) INTO v_biggest FROM jsonb_array_elements(v_lines) l;
    SELECT jsonb_build_array(l) INTO v_lines
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS t(l, n)
    WHERE (l->>'amount_minor')::INT = v_biggest
    ORDER BY n LIMIT 1;
  END IF;

  -- Cap the total; when capped, the last lines are reduced so the lines still add up.
  v_cap := floor(v_base * v_settings.max_total_percent / 100.0)::INT;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'amount_minor', capped) ORDER BY n), '[]'::jsonb),
         COALESCE(sum(capped), 0)
  INTO v_lines, v_total
  FROM (
    SELECT n, l->>'kind' AS kind,
           greatest(0, least((l->>'amount_minor')::INT,
             v_cap - COALESCE(sum((l->>'amount_minor')::INT) OVER (ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
           ))::INT AS capped
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS t(l, n)
  ) c
  WHERE capped > 0;

  NEW.discount_minor := v_total;
  NEW.discount_lines := v_lines;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_class_discounts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS engagements_apply_class_discounts ON engagements;
CREATE TRIGGER engagements_apply_class_discounts
  BEFORE INSERT ON engagements
  FOR EACH ROW EXECUTE FUNCTION private.apply_class_discounts();

-- The discount is fixed once the enrolment exists: nobody changes it by editing the enrolment.
-- (A different monthly amount for one student is set on the monthly plan instead.)
-- The one exception is public.apply_class_coupon, which flags its own update.
CREATE OR REPLACE FUNCTION private.keep_class_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('opalswift.applying_class_coupon', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.discount_minor := OLD.discount_minor;
  NEW.discount_lines := OLD.discount_lines;
  NEW.first_discount_minor := OLD.first_discount_minor;
  NEW.coupon_id := OLD.coupon_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engagements_keep_class_discount ON engagements;
CREATE TRIGGER engagements_keep_class_discount
  BEFORE UPDATE OF discount_minor, discount_lines, first_discount_minor, coupon_id ON engagements
  FOR EACH ROW EXECUTE FUNCTION private.keep_class_discount();

-- A parent typed a coupon code at checkout (called by the checkout edge function,
-- after it has checked the parent may pay for this enrolment). A valid code
-- replaces any coupon already on the enrolment. It is added on top of the
-- automatic discounts, within the studio's maximum. Never raises for a bad code:
-- returns {"ok": false, "reason": ...} so checkout carries on at the full price.
CREATE OR REPLACE FUNCTION public.apply_class_coupon(p_engagement_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eng     engagements%ROWTYPE;
  v_offering RECORD;
  v_coupon  class_discount_coupons%ROWTYPE;
  v_code    TEXT := upper(btrim(COALESCE(p_code, '')));
  v_lines   JSONB;
  v_total   INT;
  v_max     INT;
  v_amount  INT;
  v_first   BOOLEAN;
  v_used    INT;
  v_today   DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT * INTO v_eng FROM engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND OR v_eng.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_payable');
  END IF;

  SELECT offering_type, price_minor INTO v_offering FROM offerings WHERE id = v_eng.offering_id;
  IF NOT FOUND OR v_offering.offering_type <> 'class' OR v_offering.price_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_class');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_coupon FROM class_discount_coupons
  WHERE tenant_id = v_eng.tenant_id AND code = v_code AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_coupon.valid_until IS NOT NULL AND v_today > v_coupon.valid_until THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_coupon.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM engagements
    WHERE coupon_id = v_coupon.id AND id <> v_eng.id AND status NOT IN ('cancelled', 'withdrawn');
    IF v_used >= v_coupon.max_uses THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
    END IF;
  END IF;

  -- The automatic lines stay as they are; any earlier coupon comes off.
  SELECT COALESCE(jsonb_agg(l ORDER BY n), '[]'::jsonb),
         COALESCE(sum((l->>'amount_minor')::INT), 0)
  INTO v_lines, v_total
  FROM jsonb_array_elements(v_eng.discount_lines) WITH ORDINALITY AS t(l, n)
  WHERE l->>'kind' <> 'coupon';

  SELECT max_total_percent INTO v_max FROM class_discount_settings WHERE tenant_id = v_eng.tenant_id;
  v_max := COALESCE(v_max, 30);
  v_amount := least(
    private.class_discount_amount(v_offering.price_minor, v_coupon.unit, v_coupon.value),
    greatest(0, floor(v_offering.price_minor * v_max / 100.0)::INT - v_total));
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'at_maximum');
  END IF;
  v_first := v_coupon.applies_to = 'first_payment';

  PERFORM set_config('opalswift.applying_class_coupon', 'on', true);
  UPDATE engagements SET
    coupon_id = v_coupon.id,
    discount_lines = v_lines || jsonb_strip_nulls(jsonb_build_object(
      'kind', 'coupon', 'amount_minor', v_amount, 'code', v_coupon.code,
      'first_only', CASE WHEN v_first THEN true END)),
    discount_minor = v_total + CASE WHEN v_first THEN 0 ELSE v_amount END,
    first_discount_minor = CASE WHEN v_first THEN v_amount ELSE 0 END
  WHERE id = v_eng.id;
  PERFORM set_config('opalswift.applying_class_coupon', 'off', true);

  RETURN jsonb_build_object('ok', true, 'amount_minor', v_amount, 'first_only', v_first);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_class_coupon(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_class_coupon(UUID, TEXT) TO service_role;
