-- =============================================================================
-- Coupons come off every payment by default (owner, 24 Nov 2026: "a discount is
-- per sale, so when the sale is a subscription it applies to all"). First payment
-- only is now just for a coupon the studio sets as a one-month discount.
--
-- Coupons saved before this (prefilled "first payment only") are switched to
-- every payment, and enrolments that already used one get it on every payment
-- too: the amount moves from first_discount_minor into discount_minor.
-- =============================================================================

ALTER TABLE class_discount_coupons ALTER COLUMN applies_to SET DEFAULT 'every_month';

UPDATE class_discount_coupons SET applies_to = 'every_month', updated_at = now()
WHERE applies_to = 'first_payment';

-- The keep-discount trigger lets this through only with the coupon flag set.
SELECT set_config('opalswift.applying_class_coupon', 'on', true);
UPDATE engagements e SET
  discount_minor = e.discount_minor + e.first_discount_minor,
  first_discount_minor = 0,
  discount_lines = (
    SELECT COALESCE(jsonb_agg(CASE WHEN l->>'kind' = 'coupon' THEN l - 'first_only' ELSE l END ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(e.discount_lines) WITH ORDINALITY AS t(l, n)
  )
WHERE e.first_discount_minor > 0
  AND e.coupon_id IS NOT NULL
  AND e.status NOT IN ('cancelled', 'withdrawn');
SELECT set_config('opalswift.applying_class_coupon', 'off', true);
