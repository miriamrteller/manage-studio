-- =============================================================================
-- Beta rule: a studio may change its payment provider in one way only, from
-- paying at the studio (payment_provider 'offline', invoicing 'none') to an
-- online provider (Grow, YPay or Invoice4U) with no invoicing or that
-- provider's own invoicing. Every other change (online to online, online to
-- offline, or away from an offline studio that issues documents) is refused.
--
-- Why: all online providers share one credential slot on tenants, and the
-- save_tenant_<provider>_credentials functions overwrite it and revoke other
-- providers' saved cards, so a switch breaks refunds, renewals and late
-- payment notices for the old provider. Support makes any other change.
--
-- The guard is a trigger, so it covers the Settings form (a direct tenants
-- update under RLS) and every save_tenant_<provider>_credentials function
-- (SECURITY DEFINER, same request). Because the error rolls back the whole
-- statement, a refused credentials save also undoes its card revocation.
-- The service role, platform administrators, migrations and the SQL editor
-- (no JWT claims) are not affected.
-- =============================================================================

CREATE OR REPLACE FUNCTION payment_provider_switch_allowed(
  p_old_payment   TEXT,
  p_old_invoicing TEXT,
  p_new_payment   TEXT,
  p_new_invoicing TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_new_payment IS NOT DISTINCT FROM p_old_payment
      OR (
        p_old_payment = 'offline'
        AND COALESCE(p_old_invoicing, 'none') = 'none'
        AND p_new_payment IN ('grow', 'ypay', 'invoice4u')
        AND COALESCE(p_new_invoicing, 'none') IN ('none', p_new_payment)
      );
$$;

COMMENT ON FUNCTION payment_provider_switch_allowed(TEXT, TEXT, TEXT, TEXT) IS
  'Beta rule: the payment provider may only change from offline (invoicing none) to grow, ypay or '
  'invoice4u, with invoicing none or the same provider. Mirrored in apps/web/src/lib/providerPairing.ts.';

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

DROP TRIGGER IF EXISTS tenants_guard_payment_provider_switch ON tenants;
CREATE TRIGGER tenants_guard_payment_provider_switch
  BEFORE UPDATE OF payment_provider ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_payment_provider_switch();
