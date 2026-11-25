-- =============================================================================
-- Term pricing: lowest price per class + founding families kept longer (owner, 25 Nov 2026).
--
-- "with all discounts a class should never get less than 50 or 60 nis respectively" and
-- "there are 2 signed up we can do for the year but everyone else it'll be term".
--   * offerings.min_price_per_class_minor: after the early price, the sister discount, the
--     up-front discount and rounding, a class never costs less than this (NULL = no floor).
--   * accounts.early_price_until: a family that keeps the early price per class for terms
--     starting on or before this date, whatever the studio's early-enrolment dates (NULL = the
--     studio's rule only).
-- Logic: packages/shared/src/termPricing.ts, loaded by _shared/payments/term-price.ts.
--
-- ADDITIVE. Both columns start NULL, so nothing changes until a studio sets them.
-- =============================================================================

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS min_price_per_class_minor INT
    CHECK (min_price_per_class_minor IS NULL OR min_price_per_class_minor > 0);
COMMENT ON COLUMN offerings.min_price_per_class_minor IS
  'Term pricing: the lowest price of one class after all automatic discounts (minor units). NULL = no floor.';

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS early_price_until DATE;
COMMENT ON COLUMN accounts.early_price_until IS
  'Term pricing: this family keeps the early price per class for terms starting on or before this date (e.g. founding families promised a year). NULL = the studio''s early-enrolment rule only.';
