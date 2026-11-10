-- =============================================================================
-- OpalSwift's own billing of studios, step B2 (docs/plans/TAKBULL-INTEGRATION.md): a studio
-- admin adds a card on a Takbull page of OpalSwift's own account. The card is saved with the
-- first charge (Takbull documents no card save without one). Dev website only for now.
--
-- * save_studio_card_token / get_studio_card_token: the token is encrypted with the app key,
--   like every provider secret; only the service role writes or reads it.
-- * my_studio_subscription: what a studio admin may see of their own plan billing (no token).
-- =============================================================================

-- Edge Functions only: store the card a studio just paid with (replaces any earlier card).
CREATE OR REPLACE FUNCTION save_studio_card_token(
  p_tenant_id UUID,
  p_token     TEXT,
  p_last4     TEXT,
  p_expiry    TEXT,
  p_next_charge_on DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'save_studio_card_token: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'p_token is required';
  END IF;
  INSERT INTO studio_subscriptions AS s (
    tenant_id, card_token_enc, card_last4, card_expiry, card_saved_at, next_charge_on,
    failed_attempts, last_failed_at, updated_at
  ) VALUES (
    p_tenant_id,
    pgp_sym_encrypt(btrim(p_token), get_app_encryption_key()),
    CASE WHEN p_last4 ~ '^[0-9]{4}$' THEN p_last4 END,
    CASE WHEN p_expiry ~ '^[0-9]{2}/[0-9]{2}$' THEN p_expiry END,
    now(), p_next_charge_on, 0, NULL, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    card_token_enc  = EXCLUDED.card_token_enc,
    card_last4      = EXCLUDED.card_last4,
    card_expiry     = EXCLUDED.card_expiry,
    card_saved_at   = EXCLUDED.card_saved_at,
    next_charge_on  = coalesce(EXCLUDED.next_charge_on, s.next_charge_on),
    failed_attempts = 0,
    last_failed_at  = NULL,
    updated_at      = now();
END;
$$;
REVOKE ALL ON FUNCTION save_studio_card_token(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_studio_card_token(UUID, TEXT, TEXT, TEXT, DATE) TO service_role;

-- Edge Functions only (the monthly charge, step B3): the studio's card token, decrypted.
CREATE OR REPLACE FUNCTION get_studio_card_token(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_studio_card_token: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT pgp_sym_decrypt(s.card_token_enc, get_app_encryption_key()) INTO v
  FROM studio_subscriptions s
  WHERE s.tenant_id = p_tenant_id AND s.card_token_enc IS NOT NULL;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION get_studio_card_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_studio_card_token(UUID) TO service_role;

-- A studio admin's own plan billing: card on file, next charge, last charge. Never the token.
CREATE OR REPLACE FUNCTION my_studio_subscription()
RETURNS TABLE (
  sub_status          TEXT,
  trial_ends_at       TIMESTAMPTZ,
  founder             BOOLEAN,
  free_until          DATE,
  card_last4          TEXT,
  card_expiry         TEXT,
  card_saved_at       TIMESTAMPTZ,
  next_charge_on      DATE,
  failed_attempts     INT,
  last_payment_status TEXT,
  last_payment_at     TIMESTAMPTZ,
  last_payment_agorot INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := get_my_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND tenant_id = v_tenant AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT t.sub_status, t.trial_ends_at, coalesce(s.founder, false), s.free_until,
         s.card_last4, s.card_expiry, s.card_saved_at, s.next_charge_on, coalesce(s.failed_attempts, 0),
         p.status, p.updated_at, p.amount_agorot
  FROM tenants t
  LEFT JOIN studio_subscriptions s ON s.tenant_id = t.id
  LEFT JOIN LATERAL (
    SELECT pp.status, pp.updated_at, pp.amount_agorot FROM platform_payments pp
    WHERE pp.tenant_id = t.id ORDER BY pp.created_at DESC, pp.period_month DESC, pp.attempt DESC LIMIT 1
  ) p ON true
  WHERE t.id = v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION my_studio_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_studio_subscription() TO authenticated;

-- The Takbull page's order id, to match its payment notice to our row.
CREATE INDEX IF NOT EXISTS idx_platform_payments_takbull_order_ref
  ON platform_payments (takbull_order_ref) WHERE takbull_order_ref IS NOT NULL;
