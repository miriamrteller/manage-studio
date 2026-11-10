-- =============================================================================
-- Class discounts (owner decisions, 10 Nov 2026; plan docs/plans/CLASS-DISCOUNTS-AND-SEASONS.md).
--
-- A studio switches on automatic discounts for classes: sibling (2nd child, and
-- 3rd child and more), an extra class for the same child, and early bird. They
-- add up, capped at a maximum the studio sets, or only the biggest one counts.
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
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
REVOKE ALL ON class_discount_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON class_discount_settings TO authenticated;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS discount_minor INT   NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN IF NOT EXISTS discount_lines JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN engagements.discount_minor IS
  'Automatic class discount off the class price, per charge (per month for monthly classes). Set once at enrolment.';
COMMENT ON COLUMN engagements.discount_lines IS
  'The discounts behind discount_minor: [{"kind": "sibling"|"extra_class"|"early_bird", "amount_minor": n}].';

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
  v_amount     INT;
  v_total      INT := 0;
  v_biggest    INT := 0;
  v_cap        INT;
  v_today      DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  -- Only this trigger sets the discount; whatever the caller sent is ignored.
  NEW.discount_minor := 0;
  NEW.discount_lines := '[]'::jsonb;

  SELECT * INTO v_settings FROM class_discount_settings WHERE tenant_id = NEW.tenant_id;
  IF NOT FOUND OR NOT (v_settings.sibling_enabled OR v_settings.extra_class_enabled OR v_settings.early_bird_enabled) THEN
    RETURN NEW;
  END IF;

  SELECT offering_type, price_minor, season_id INTO v_offering FROM offerings WHERE id = NEW.offering_id;
  IF NOT FOUND OR v_offering.offering_type <> 'class' OR v_offering.price_minor <= 0 THEN
    RETURN NEW;
  END IF;
  v_base := v_offering.price_minor;
  v_season_id := COALESCE(NEW.season_id, v_offering.season_id);

  -- Sibling: this child is the 2nd, or 3rd and more, child of the family to enrol
  -- in a class this season. The order is set by each child's first open class
  -- enrolment in the season, so a first child's extra class is not a "sibling" one.
  IF v_settings.sibling_enabled THEN
    SELECT account_id INTO v_account_id FROM people WHERE id = NEW.person_id;
    IF v_account_id IS NOT NULL THEN
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
        AND p.account_id = v_account_id
        AND e.person_id <> NEW.person_id
        AND e.status NOT IN ('cancelled', 'withdrawn')
        AND e.created_at < v_first
        AND o.offering_type = 'class'
        AND COALESCE(e.season_id, o.season_id) IS NOT DISTINCT FROM v_season_id;
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
CREATE OR REPLACE FUNCTION private.keep_class_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.discount_minor := OLD.discount_minor;
  NEW.discount_lines := OLD.discount_lines;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engagements_keep_class_discount ON engagements;
CREATE TRIGGER engagements_keep_class_discount
  BEFORE UPDATE OF discount_minor, discount_lines ON engagements
  FOR EACH ROW EXECUTE FUNCTION private.keep_class_discount();
