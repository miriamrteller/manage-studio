-- Creative Ballet (creativeballet), owner decisions 25 Nov 2026:
--   * Founding Families = 10% off, this term only: early price per class ₪54 (45 min) / ₪63 (1 hour)
--     instead of ₪50 / ₪60, and the early price ends with this term (last class Wed 14 Apr 2027)
--     instead of 31 Dec 2027.
--   * With all discounts combined a class never costs less than ₪50 (45 min) / ₪60 (1 hour).
-- Needs migration 20261125150000_term_pricing_floor_and_founding_family (min_price_per_class_minor).
-- The 2 founding families kept for the year get accounts.early_price_until in OpalSwift once enrolled.
-- Expected: UPDATE 2 (45-min classes), UPDATE 3 (1-hour classes), UPDATE 1 (studio rules).
-- Guard: refuses unless exactly 5 term-priced classes and 1 rules row are found.

DO $$
DECLARE
  tid uuid;
  n int;
BEGIN
  SELECT id INTO tid FROM tenants WHERE subdomain = 'creativeballet';
  IF tid IS NULL THEN RAISE EXCEPTION 'creativeballet not found'; END IF;
  SELECT count(*) INTO n FROM offerings WHERE tenant_id = tid AND price_per_class_minor IN (6000, 7000);
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 term-priced classes, found %', n; END IF;
  SELECT count(*) INTO n FROM tenant_term_pricing WHERE tenant_id = tid;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 term pricing row, found %', n; END IF;
END $$;

-- 45 minutes (Kita 1-2, Kita 3-5)
UPDATE offerings
   SET early_price_per_class_minor = 5400, min_price_per_class_minor = 5000
 WHERE id IN ('fd02732d-5c0b-4f65-ae12-de1b77a94992', '03f502eb-b128-4e99-89d5-3a7d3c05c290')
   AND price_per_class_minor = 6000;

-- 1 hour (Kita 6+, High School, Womens)
UPDATE offerings
   SET early_price_per_class_minor = 6300, min_price_per_class_minor = 6000
 WHERE id IN ('11bbd279-f678-4f99-a3d8-3c7b1b688a2f', '80a00931-7346-4b2e-9e3b-006ca319a77a', '265d47cb-f668-4fbf-9598-bcfea67c6795')
   AND price_per_class_minor = 7000;

-- Founding price for terms starting by the end of this term only.
UPDATE tenant_term_pricing
   SET early_until = '2027-04-14'
 WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = 'creativeballet');
