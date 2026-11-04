-- =============================================================================
-- Takbull PR 3: monthly fees charged to the saved card (ChargeToken).
--
-- takbull_orders gains:
--   charge_key       one charge attempt (a renewal month and attempt, or a card link for a
--                    month). Unique, so the monthly run can never send the same attempt to
--                    Takbull twice, even while the first one is still waiting for its notice.
--   paid_for_period  the month (YYYY-MM) a renewal or card-link payment pays, so settling it
--                    moves the plan past exactly that month.
-- Hidden: no studio is on Takbull yet.
-- =============================================================================

ALTER TABLE takbull_orders
  ADD COLUMN IF NOT EXISTS charge_key TEXT,
  ADD COLUMN IF NOT EXISTS paid_for_period TEXT
    CHECK (paid_for_period IS NULL OR paid_for_period ~ '^\d{4}-(0[1-9]|1[0-2])$');

CREATE UNIQUE INDEX IF NOT EXISTS takbull_orders_charge_key_key
  ON takbull_orders (charge_key)
  WHERE charge_key IS NOT NULL;

COMMENT ON COLUMN takbull_orders.charge_key IS
  'One charge attempt (renewal month + attempt, or card link + month). Unique: never charged twice.';
COMMENT ON COLUMN takbull_orders.paid_for_period IS
  'The month (YYYY-MM) a renewal or card-link payment pays; the plan moves past exactly that month.';
