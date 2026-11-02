-- =============================================================================
-- Payment provider choice (payments follow-up 4, owner decisions).
--
-- 1) Loosen 20261102185342: a studio may change its payment provider freely, in
--    any direction, to pay at the studio, Grow, YPay or Invoice4U, while it has
--    no real payment yet (no succeeded payment, manual ones included; a payment
--    later refunded still counts). After its first payment the earlier rule
--    stands: only pay at the studio (no documents) -> Grow, YPay or Invoice4U,
--    and anything else goes through OpalSwift support.
-- 2) Backstop: a studio on YPay or Invoice4U cannot create a monthly
--    (recurring) class: "Monthly fees need Grow." The Settings and setup screens
--    already steer studios with monthly fees to Grow.
--
-- Both guards apply to requests through the API (JWT claims) and skip the
-- service role, platform administrators, migrations and the SQL editor.
-- =============================================================================

-- Invoker rights on purpose: it runs inside the tenants trigger as the admin
-- making the change, whose RLS reads their own studio's payments.
CREATE OR REPLACE FUNCTION tenant_has_succeeded_payment(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payments
    WHERE tenant_id = p_tenant_id
      AND status IN ('succeeded', 'partially_refunded', 'refunded')
  );
$$;

COMMENT ON FUNCTION tenant_has_succeeded_payment(UUID) IS
  'True once the studio has taken a real payment (succeeded, or later refunded). Until then it '
  'may change its payment provider freely (guard_tenant_payment_provider_switch).';

CREATE OR REPLACE FUNCTION guard_tenant_payment_provider_switch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_provider IS NOT DISTINCT FROM OLD.payment_provider THEN
    RETURN NEW;
  END IF;
  -- A request through the API carries JWT claims; the SQL editor and migrations do not
  -- (a pooled connection may hold an empty string after an earlier request).
  IF nullif(current_setting('request.jwt.claims', true), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF is_service_role() OR is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- Before the first payment: any of the offered providers, in any direction.
  IF NEW.payment_provider IN ('offline', 'grow', 'ypay', 'invoice4u')
     AND NOT tenant_has_succeeded_payment(OLD.id) THEN
    RETURN NEW;
  END IF;
  IF NOT payment_provider_switch_allowed(
    OLD.payment_provider, OLD.invoicing_provider, NEW.payment_provider, NEW.invoicing_provider
  ) THEN
    RAISE EXCEPTION 'payment_provider_switch_blocked'
      USING ERRCODE = '42501',
            DETAIL = format('%s to %s', OLD.payment_provider, NEW.payment_provider),
            HINT = 'To change your payment provider, contact OpalSwift support.';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Backstop: monthly classes need Grow ──────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_offering_recurring_needs_grow()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_mode IS DISTINCT FROM 'recurring' THEN
    RETURN NEW;
  END IF;
  -- Editing a class that was already monthly is not creating one.
  IF TG_OP = 'UPDATE' AND OLD.billing_mode = 'recurring' THEN
    RETURN NEW;
  END IF;
  IF nullif(current_setting('request.jwt.claims', true), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF is_service_role() OR is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE id = NEW.tenant_id AND payment_provider IN ('ypay', 'invoice4u')
  ) THEN
    RAISE EXCEPTION 'monthly_fees_need_grow'
      USING ERRCODE = '42501',
            HINT = 'Monthly fees need Grow. Contact OpalSwift support.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offerings_guard_recurring_needs_grow ON offerings;
CREATE TRIGGER offerings_guard_recurring_needs_grow
  BEFORE INSERT OR UPDATE OF billing_mode ON offerings
  FOR EACH ROW EXECUTE FUNCTION guard_offering_recurring_needs_grow();
