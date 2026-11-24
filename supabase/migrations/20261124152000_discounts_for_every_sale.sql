-- =============================================================================
-- Discounts for every studio and every kind of sale (owner, 24 Nov 2026: "I hope
-- this is available to all OpalSwift members ... its own feature switch, not
-- connected to anything else"; "a discount is per sale, so when the sale is a
-- subscription it applies to all").
--
--   * Feature 'billing:discounts': its own switch, on for every studio (core, no
--     business-profile gate). The platform owner can turn it off for a studio.
--   * Enrolments and bookings (engagements): the class rules (sibling, extra
--     class, early bird) stay for classes; a booking or package gets the client's
--     own discount; a coupon code works on both. A monthly class keeps the
--     every-payment rule.
--   * Payment requests (/pay: shoots and quotes, the photo shop, the clothes shop,
--     class cards): the client's own discount is worked out when the request is
--     made, and a coupon code can be typed on the pay page. A percentage comes
--     off every payment of the sale (a shoot's deposit and balance); a fixed
--     amount comes off once per sale. A shop order or class card is its own sale.
--   * The table names keep their first "class_" name (class_discount_settings,
--     class_discount_clients, class_discount_coupons); they now cover every sale.
-- =============================================================================

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('billing:discounts', 'Discounts: automatic class discounts, per-client discounts and coupon codes', 'essential', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- The studio has discounts switched on.
CREATE OR REPLACE FUNCTION private.discounts_on(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 'billing:discounts' = ANY(get_tenant_features(p_tenant));
$$;
REVOKE ALL ON FUNCTION private.discounts_on(UUID) FROM PUBLIC, anon, authenticated;

-- Payment requests carry their own discount (see below).
ALTER TABLE job_payment_requests
  ADD COLUMN IF NOT EXISTS list_amount_minor INT CHECK (list_amount_minor IS NULL OR list_amount_minor >= 0),
  ADD COLUMN IF NOT EXISTS discount_minor    INT   NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN IF NOT EXISTS discount_lines    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coupon_id         UUID REFERENCES class_discount_coupons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_payment_requests_coupon ON job_payment_requests(coupon_id) WHERE coupon_id IS NOT NULL;

COMMENT ON COLUMN job_payment_requests.list_amount_minor IS
  'The amount before discounts; NULL when there is no discount. amount_minor is what the client pays.';
COMMENT ON COLUMN job_payment_requests.discount_lines IS
  'The discounts behind discount_minor: [{"kind": "client"|"coupon", "amount_minor": n, "code"?: text}].';

-- How many times a coupon has been used, leaving out one enrolment or one payment request.
CREATE OR REPLACE FUNCTION private.coupon_uses(p_coupon UUID, p_skip_engagement UUID, p_skip_request UUID)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM engagements
          WHERE coupon_id = p_coupon AND id IS DISTINCT FROM p_skip_engagement
            AND status NOT IN ('cancelled', 'withdrawn'))::INT
       + (SELECT count(DISTINCT CASE WHEN shop_order_id IS NULL AND class_card_id IS NULL THEN engagement_id ELSE id END)
          FROM job_payment_requests
          WHERE coupon_id = p_coupon AND id IS DISTINCT FROM p_skip_request AND status <> 'cancelled')::INT;
$$;
REVOKE ALL ON FUNCTION private.coupon_uses(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Enrolments and bookings: the class rules for classes, the client's own discount for bookings too.
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
  v_is_class   BOOLEAN;
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

  -- Discounts have their own switch (on for every studio unless turned off).
  IF NOT private.discounts_on(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

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
  IF NOT FOUND OR v_offering.offering_type NOT IN ('class', 'appointment') OR v_offering.price_minor <= 0 THEN
    RETURN NEW;
  END IF;
  -- Sibling, extra class and early bird are class things; a booking gets the client's own discount.
  v_is_class := v_offering.offering_type = 'class';
  v_base := v_offering.price_minor;
  v_season_id := COALESCE(NEW.season_id, v_offering.season_id);

  -- Sibling: this child is the 2nd, or 3rd and more, child of the family to enrol
  -- in a class this season. A family is the same account, or children that share
  -- a parent email. The order is set by each child's first open class enrolment
  -- in the season, so a first child's extra class is not a "sibling" one.
  v_emails := private.person_contact_emails(NEW.person_id);
  IF v_is_class AND v_settings.sibling_enabled THEN
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
  IF v_is_class AND v_settings.extra_class_enabled AND EXISTS (
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
  IF v_is_class AND v_settings.early_bird_enabled AND v_season_id IS NOT NULL THEN
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


-- A coupon code on an enrolment or a booking.
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
  IF NOT FOUND OR v_offering.offering_type NOT IN ('class', 'appointment') OR v_offering.price_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_class');
  END IF;

  IF v_code = '' OR NOT private.discounts_on(v_eng.tenant_id) THEN
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
    v_used := private.coupon_uses(v_coupon.id, v_eng.id, NULL);
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


-- -----------------------------------------------------------------------------
-- Payment requests (/pay)
-- -----------------------------------------------------------------------------
-- Discount lines for one payment of a sale. A percentage comes off every payment;
-- a fixed amount once per sale (p_amount_used: it already came off another payment).
CREATE OR REPLACE FUNCTION private.request_discount_lines(
  p_tenant UUID, p_base INT, p_emails TEXT[], p_coupon UUID, p_client_amount_used BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_lines  JSONB := '[]'::jsonb;
  v_amount INT;
  v_max    INT;
  v_mode   TEXT;
  v_cap    INT;
  v_coupon class_discount_coupons%ROWTYPE;
BEGIN
  IF p_base <= 0 THEN
    RETURN v_lines;
  END IF;
  SELECT max_total_percent, combine_mode INTO v_max, v_mode FROM class_discount_settings WHERE tenant_id = p_tenant;
  v_max := COALESCE(v_max, 30);

  IF cardinality(p_emails) > 0 THEN
    SELECT max(CASE WHEN c.unit = 'percent' THEN private.class_discount_amount(p_base, c.unit, c.value)
                    WHEN p_client_amount_used THEN 0
                    ELSE private.class_discount_amount(p_base, c.unit, c.value) END)
    INTO v_amount
    FROM class_discount_clients c
    WHERE c.tenant_id = p_tenant AND c.email = ANY(p_emails);
    IF COALESCE(v_amount, 0) > 0 THEN
      v_lines := v_lines || jsonb_build_object('kind', 'client', 'amount_minor', v_amount);
    END IF;
  END IF;

  v_cap := floor(p_base * v_max / 100.0)::INT;
  v_amount := least(COALESCE((v_lines->0->>'amount_minor')::INT, 0), v_cap);
  IF jsonb_array_length(v_lines) > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object('kind', 'client', 'amount_minor', v_amount));
  END IF;

  IF p_coupon IS NOT NULL THEN
    SELECT * INTO v_coupon FROM class_discount_coupons WHERE id = p_coupon;
    IF FOUND THEN
      v_amount := least(private.class_discount_amount(p_base, v_coupon.unit, v_coupon.value),
                        greatest(0, v_cap - COALESCE((v_lines->0->>'amount_minor')::INT, 0)));
      IF v_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object('kind', 'coupon', 'amount_minor', v_amount, 'code', v_coupon.code);
      END IF;
    END IF;
  END IF;

  RETURN (SELECT COALESCE(jsonb_agg(l ORDER BY n), '[]'::jsonb)
          FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS t(l, n)
          WHERE (l->>'amount_minor')::INT > 0);
END;
$$;
REVOKE ALL ON FUNCTION private.request_discount_lines(UUID, INT, TEXT[], UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- A new payment request: the client's own discount, and a percentage coupon
-- already used on another payment of the same shoot. Runs as the table owner.
CREATE OR REPLACE FUNCTION private.apply_request_discounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person      UUID;
  v_own_sale    BOOLEAN := NEW.shop_order_id IS NOT NULL OR NEW.class_card_id IS NOT NULL;
  v_coupon      UUID;
  v_amount_used BOOLEAN := false;
  v_lines       JSONB;
  v_total       INT;
BEGIN
  NEW.list_amount_minor := NULL;
  NEW.discount_minor := 0;
  NEW.discount_lines := '[]'::jsonb;
  NEW.coupon_id := NULL;

  IF NEW.amount_minor <= 0 OR NOT private.discounts_on(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT person_id INTO v_person FROM engagements WHERE id = NEW.engagement_id;

  IF NOT v_own_sale THEN
    -- A fixed client discount already came off another payment of this shoot.
    v_amount_used := EXISTS (
      SELECT 1 FROM job_payment_requests r, jsonb_array_elements(r.discount_lines) l
      JOIN class_discount_clients c ON c.tenant_id = NEW.tenant_id AND c.unit = 'amount'
      WHERE r.engagement_id = NEW.engagement_id AND r.status <> 'cancelled'
        AND r.shop_order_id IS NULL AND r.class_card_id IS NULL
        AND l->>'kind' = 'client');
    -- A percentage coupon on this shoot carries on to its later payments.
    SELECT r.coupon_id INTO v_coupon
    FROM job_payment_requests r JOIN class_discount_coupons c ON c.id = r.coupon_id
    WHERE r.engagement_id = NEW.engagement_id AND r.status <> 'cancelled'
      AND r.shop_order_id IS NULL AND r.class_card_id IS NULL
      AND c.unit = 'percent' AND c.active
    ORDER BY r.created_at DESC LIMIT 1;
  END IF;

  v_lines := private.request_discount_lines(
    NEW.tenant_id, NEW.amount_minor,
    CASE WHEN v_person IS NULL THEN '{}'::TEXT[] ELSE private.person_contact_emails(v_person) END,
    v_coupon, v_amount_used);
  SELECT COALESCE(sum((l->>'amount_minor')::INT), 0) INTO v_total FROM jsonb_array_elements(v_lines) l;
  IF v_total > 0 THEN
    NEW.list_amount_minor := NEW.amount_minor;
    NEW.amount_minor := NEW.amount_minor - v_total;
    NEW.discount_minor := v_total;
    NEW.discount_lines := v_lines;
    NEW.coupon_id := v_coupon;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_request_discounts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_payment_requests_apply_discounts ON job_payment_requests;
CREATE TRIGGER job_payment_requests_apply_discounts
  BEFORE INSERT ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION private.apply_request_discounts();

-- Discounts on a request change only through public.apply_request_coupon. When the
-- studio edits the amount of an unpaid request by hand, its amount wins and the
-- discount lines go.
CREATE OR REPLACE FUNCTION private.keep_request_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('opalswift.applying_class_coupon', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.amount_minor IS DISTINCT FROM OLD.amount_minor AND OLD.status NOT IN ('paid', 'refunded_manual') THEN
    NEW.list_amount_minor := NULL;
    NEW.discount_minor := 0;
    NEW.discount_lines := '[]'::jsonb;
    NEW.coupon_id := NULL;
    RETURN NEW;
  END IF;
  NEW.list_amount_minor := OLD.list_amount_minor;
  NEW.discount_minor := OLD.discount_minor;
  NEW.discount_lines := OLD.discount_lines;
  NEW.coupon_id := OLD.coupon_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_payment_requests_keep_discount ON job_payment_requests;
CREATE TRIGGER job_payment_requests_keep_discount
  BEFORE UPDATE OF amount_minor, list_amount_minor, discount_minor, discount_lines, coupon_id ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION private.keep_request_discount();

-- A client typed a coupon code on the pay page (/pay/:token, called by the edge
-- function with the request's token). A percentage coupon on a shoot also comes
-- off its other unpaid payments. Never raises for a bad code.
CREATE OR REPLACE FUNCTION public.apply_request_coupon(p_token TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req     job_payment_requests%ROWTYPE;
  v_coupon  class_discount_coupons%ROWTYPE;
  v_code    TEXT := upper(btrim(COALESCE(p_code, '')));
  v_today   DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_person  UUID;
  v_emails  TEXT[];
  v_own     BOOLEAN;
  v_used    INT;
  v_target  RECORD;
  v_lines   JSONB;
  v_total   INT;
  v_amount  INT := 0;
BEGIN
  SELECT * INTO v_req FROM job_payment_requests WHERE public_token = p_token FOR UPDATE;
  IF NOT FOUND OR v_req.status NOT IN ('pending', 'sent') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_payable');
  END IF;
  IF v_code = '' OR NOT private.discounts_on(v_req.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_coupon FROM class_discount_coupons
  WHERE tenant_id = v_req.tenant_id AND code = v_code AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_coupon.valid_until IS NOT NULL AND v_today > v_coupon.valid_until THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  v_own := v_req.shop_order_id IS NOT NULL OR v_req.class_card_id IS NOT NULL;
  IF v_coupon.max_uses IS NOT NULL THEN
    v_used := private.coupon_uses(v_coupon.id, NULL, v_req.id)
            - CASE WHEN NOT v_own AND EXISTS (
                SELECT 1 FROM job_payment_requests
                WHERE engagement_id = v_req.engagement_id AND coupon_id = v_coupon.id AND id <> v_req.id
                  AND status <> 'cancelled' AND shop_order_id IS NULL AND class_card_id IS NULL)
              THEN 1 ELSE 0 END;
    IF v_used >= v_coupon.max_uses THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
    END IF;
  END IF;

  SELECT person_id INTO v_person FROM engagements WHERE id = v_req.engagement_id;
  v_emails := CASE WHEN v_person IS NULL THEN '{}'::TEXT[] ELSE private.person_contact_emails(v_person) END;

  PERFORM set_config('opalswift.applying_class_coupon', 'on', true);
  FOR v_target IN
    SELECT * FROM job_payment_requests r
    WHERE r.id = v_req.id
       OR (v_coupon.unit = 'percent' AND NOT v_own
           AND r.engagement_id = v_req.engagement_id AND r.status IN ('pending', 'sent')
           AND r.shop_order_id IS NULL AND r.class_card_id IS NULL)
    ORDER BY (r.id = v_req.id) DESC, r.created_at
  LOOP
    v_lines := private.request_discount_lines(
      v_target.tenant_id, COALESCE(v_target.list_amount_minor, v_target.amount_minor), v_emails, v_coupon.id,
      -- keep a fixed client discount where it already is
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_target.discount_lines) l WHERE l->>'kind' = 'client')
        AND EXISTS (SELECT 1 FROM job_payment_requests o, jsonb_array_elements(o.discount_lines) l
                    WHERE NOT v_own AND o.engagement_id = v_target.engagement_id AND o.id <> v_target.id
                      AND o.status <> 'cancelled' AND l->>'kind' = 'client'));
    SELECT COALESCE(sum((l->>'amount_minor')::INT), 0) INTO v_total FROM jsonb_array_elements(v_lines) l;
    IF v_target.id = v_req.id THEN
      SELECT COALESCE(sum((l->>'amount_minor')::INT), 0) INTO v_amount
      FROM jsonb_array_elements(v_lines) l WHERE l->>'kind' = 'coupon';
      IF v_amount <= 0 THEN
        PERFORM set_config('opalswift.applying_class_coupon', 'off', true);
        RETURN jsonb_build_object('ok', false, 'reason', 'at_maximum');
      END IF;
    END IF;
    UPDATE job_payment_requests SET
      list_amount_minor = COALESCE(v_target.list_amount_minor, v_target.amount_minor),
      amount_minor = COALESCE(v_target.list_amount_minor, v_target.amount_minor) - v_total,
      discount_minor = v_total,
      discount_lines = v_lines,
      coupon_id = v_coupon.id
    WHERE id = v_target.id;
  END LOOP;
  PERFORM set_config('opalswift.applying_class_coupon', 'off', true);

  RETURN jsonb_build_object('ok', true, 'amount_minor', v_amount, 'first_only', false);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_request_coupon(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_request_coupon(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- The discount shows wherever the price does: the quote page, shop order
-- lists and the public Shop page's coupon box.
-- ---------------------------------------------------------------------------

-- The client's own discount for a quote, so the quote page can show the deposit and
-- balance after it (worked out on the page as optional extras are ticked). Matched
-- on the same emails the payment requests use. NULL when there is none.
CREATE OR REPLACE FUNCTION private.quote_client_discounts(p_quote UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_q      quotes%ROWTYPE;
  v_person UUID;
  v_emails TEXT[] := '{}'::TEXT[];
  v_email  TEXT;
  v_rules  JSONB;
  v_max    INT;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote;
  IF NOT FOUND OR NOT private.discounts_on(v_q.tenant_id) THEN
    RETURN NULL;
  END IF;
  SELECT e.person_id INTO v_person FROM engagements e WHERE e.id = v_q.engagement_id;
  IF v_person IS NULL THEN
    SELECT a.person_id INTO v_person FROM accounts a WHERE a.id = v_q.account_id;
  END IF;
  IF v_person IS NOT NULL THEN
    v_emails := private.person_contact_emails(v_person);
  END IF;
  SELECT lower(btrim(client_email)) INTO v_email FROM quote_client_contact(p_quote);
  IF v_email IS NOT NULL AND v_email <> '' THEN
    v_emails := v_emails || v_email;
  END IF;
  IF cardinality(v_emails) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('unit', c.unit, 'value', c.value) ORDER BY c.unit, c.value)
  INTO v_rules
  FROM class_discount_clients c
  WHERE c.tenant_id = v_q.tenant_id AND c.email = ANY(v_emails);
  IF v_rules IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT max_total_percent INTO v_max FROM class_discount_settings WHERE tenant_id = v_q.tenant_id;
  RETURN jsonb_build_object('rules', v_rules, 'max_total_percent', COALESCE(v_max, 30));
END;
$$;
REVOKE ALL ON FUNCTION private.quote_client_discounts(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_public_quote(p_token TEXT, p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      quotes%ROWTYPE;
  v_status TEXT;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v_q FROM quotes WHERE public_token = p_token AND tenant_id = p_tenant_id;
  -- Drafts are invisible: the admin has not sent them yet.
  IF NOT FOUND OR v_q.status = 'draft' THEN RETURN NULL; END IF;

  -- valid_until is information only: a sent quote stays open after the date.
  v_status := v_q.status;

  RETURN jsonb_build_object(
    'status', v_status, 'title', v_q.title, 'currency', v_q.currency,
    'shoot_date', v_q.shoot_date, 'valid_until', v_q.valid_until, 'notes', v_q.notes,
    'deposit_percent', v_q.deposit_percent, 'balance_max_installments', v_q.balance_max_installments,
    'required_minor', v_q.required_minor, 'optional_selected_minor', v_q.optional_selected_minor,
    'total_minor', v_q.total_minor, 'deposit_minor', v_q.deposit_minor, 'balance_minor', v_q.balance_minor,
    'accepted_at', v_q.accepted_at,
    'client_name', (SELECT client_name FROM quote_client_contact(v_q.id)),
    'client_discount', private.quote_client_discounts(v_q.id),
    'lines', quote_lines_json(v_q.id));
END;
$$;

-- What came off a shop order: its payment requests' discounts.
CREATE OR REPLACE FUNCTION private.shop_order_discount_minor(p_order UUID)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(r.discount_minor), 0)::INT
  FROM job_payment_requests r
  WHERE r.shop_order_id = p_order AND r.status <> 'cancelled';
$$;
REVOKE ALL ON FUNCTION private.shop_order_discount_minor(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_my_shop_orders()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'person_id', o.person_id, 'person_name', p.name, 'status', o.status,
           'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at,
           'discount_minor', private.shop_order_discount_minor(o.id),
           'paid_at', o.paid_at, 'ready_at', o.ready_at, 'collected_at', o.collected_at,
           'refunded', o.refunded_at IS NOT NULL,
           'pay_token', (SELECT r.public_token FROM job_payment_requests r
                          WHERE r.shop_order_id = o.id AND r.status IN ('pending', 'sent') LIMIT 1),
           'lines', private.shop_order_lines_json(o.id))
           ORDER BY o.created_at DESC), '[]'::jsonb)
    FROM shop_orders o JOIN people p ON p.id = o.person_id
   WHERE o.tenant_id = get_my_tenant_id()
     AND private.studio_shop_enabled(o.tenant_id)
     AND o.status <> 'cancelled'
     AND (o.person_id = get_my_person_id()
          OR o.ordered_by = get_my_person_id()
          OR (p.account_id IS NOT NULL AND p.account_id IN (SELECT get_my_account_ids())));
$$;
REVOKE ALL ON FUNCTION get_my_shop_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_shop_orders() TO authenticated;

CREATE OR REPLACE FUNCTION get_studio_shop_orders()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID := get_my_tenant_id();
BEGIN
  IF v_tenant_id IS NULL OR NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'get_studio_shop_orders: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', o.id, 'person_id', o.person_id, 'person_name', p.name,
             'ordered_by_name', ob.name, 'status', o.status,
             'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at,
             'discount_minor', private.shop_order_discount_minor(o.id),
             'paid_at', o.paid_at, 'ready_at', o.ready_at, 'collected_at', o.collected_at,
             'cancelled_at', o.cancelled_at, 'refunded', o.refunded_at IS NOT NULL,
             'pay_by_cash', o.pay_by_cash, 'guest', o.guest,
             'contact_email', COALESCE(o.contact_email, p.email), 'contact_phone', o.contact_phone,
             'request_id', (SELECT r.id FROM job_payment_requests r
                             WHERE r.shop_order_id = o.id AND r.status IN ('pending', 'sent') LIMIT 1),
             'lines', private.shop_order_lines_json(o.id))
             ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM shop_orders o
      JOIN people p ON p.id = o.person_id
      LEFT JOIN people ob ON ob.id = o.ordered_by
     WHERE o.tenant_id = v_tenant_id
       AND (o.status <> 'cancelled' OR o.cancelled_at > now() - interval '30 days')
  );
END;
$$;
REVOKE ALL ON FUNCTION get_studio_shop_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_studio_shop_orders() TO authenticated;

-- The public Shop page offers a coupon box only when the studio has a code switched on.
-- Says only whether there is one, never which.
CREATE OR REPLACE FUNCTION public.studio_offers_coupons(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.discounts_on(p_tenant_id)
     AND EXISTS (SELECT 1 FROM class_discount_coupons c WHERE c.tenant_id = p_tenant_id AND c.active);
$$;
REVOKE ALL ON FUNCTION public.studio_offers_coupons(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.studio_offers_coupons(UUID) TO anon, authenticated, service_role;
