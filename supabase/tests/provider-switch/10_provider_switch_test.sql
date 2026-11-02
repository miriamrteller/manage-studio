-- Each check runs as a studio admin (JWT claims set) unless it says otherwise.
SET app.encryption_key = 'provider-switch-test-key';

CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS grow_studio, gen_random_uuid() AS offline_studio,
  gen_random_uuid() AS offline_docs_studio, gen_random_uuid() AS person,
  gen_random_uuid() AS billing, gen_random_uuid() AS grow_admin,
  gen_random_uuid() AS offline_admin, gen_random_uuid() AS docs_admin;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, payment_provider, invoicing_provider)
SELECT grow_studio, 'Grow studio', 'ps-grow-' || substr(md5(random()::text), 1, 8), 'g@example.test', 'grow', 'grow' FROM ids
UNION ALL
SELECT offline_studio, 'Offline studio', 'ps-off-' || substr(md5(random()::text), 1, 8), 'o@example.test', 'offline', 'none' FROM ids
UNION ALL
SELECT offline_docs_studio, 'Offline with documents', 'ps-docs-' || substr(md5(random()::text), 1, 8), 'd@example.test', 'offline', 'ypay' FROM ids;

INSERT INTO auth.users (id, email)
SELECT grow_admin, 'ps-grow@example.test' FROM ids
UNION ALL SELECT offline_admin, 'ps-off@example.test' FROM ids
UNION ALL SELECT docs_admin, 'ps-docs@example.test' FROM ids;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT grow_admin, grow_studio, ARRAY['tenant_admin'], 'ps-grow@example.test' FROM ids
UNION ALL SELECT offline_admin, offline_studio, ARRAY['tenant_admin'], 'ps-off@example.test' FROM ids
UNION ALL SELECT docs_admin, offline_docs_studio, ARRAY['tenant_admin'], 'ps-docs@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

-- A saved Grow card, so a refused switch can be shown not to revoke it.
INSERT INTO people (id, tenant_id, name) SELECT person, grow_studio, 'Card holder' FROM ids;
INSERT INTO billing_accounts (id, tenant_id, person_id) SELECT billing, grow_studio, person FROM ids;
INSERT INTO payment_method_tokens (tenant_id, billing_account_id, provider, provider_token, is_default)
SELECT grow_studio, billing, 'grow', 'tok_grow_1', true FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
  SELECT set_config('request.jwt.claim.sub', '', false);
$$;
CREATE FUNCTION pg_temp.no_claims() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', NULL, false);
  SELECT set_config('request.jwt.claim.sub', '', false);
$$;

-- Runs p_sql and reports whether it was refused with payment_provider_switch_blocked.
CREATE FUNCTION pg_temp.blocked(p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'payment_provider_switch_blocked' THEN RAISE; END IF;
  RETURN true;
END;
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  v_t tenants%ROWTYPE;
  v_secret_before bytea;
BEGIN
  SELECT * INTO v FROM ids;

  -- ── 1. An online studio cannot switch, in Settings or by saving other keys ──
  PERFORM pg_temp.act_as(v.grow_admin);
  SELECT payment_provider_secret_enc INTO v_secret_before FROM tenants WHERE id = v.grow_studio;
  IF NOT pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L WHERE id = %L', 'ypay', v.grow_studio)) THEN
    RAISE EXCEPTION 'FAIL grow → ypay in Settings was allowed';
  END IF;
  IF NOT pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L WHERE id = %L', 'offline', v.grow_studio)) THEN
    RAISE EXCEPTION 'FAIL grow → offline in Settings was allowed';
  END IF;
  IF NOT pg_temp.blocked($q$SELECT save_tenant_ypay_credentials('client', 'secret')$q$) THEN
    RAISE EXCEPTION 'FAIL save_tenant_ypay_credentials switched a Grow studio';
  END IF;
  IF NOT pg_temp.blocked($q$SELECT save_tenant_invoice4u_credentials('api-key', '1')$q$) THEN
    RAISE EXCEPTION 'FAIL save_tenant_invoice4u_credentials switched a Grow studio';
  END IF;
  IF NOT pg_temp.blocked($q$SELECT save_tenant_icount_credentials('c', 'p', 't')$q$) THEN
    RAISE EXCEPTION 'FAIL save_tenant_icount_credentials switched a Grow studio';
  END IF;
  IF NOT pg_temp.blocked($q$SELECT save_tenant_tranzila_credentials('term1', 'app', 'sec')$q$) THEN
    RAISE EXCEPTION 'FAIL save_tenant_tranzila_credentials switched a Grow studio';
  END IF;
  SELECT * INTO v_t FROM tenants WHERE id = v.grow_studio;
  IF v_t.payment_provider <> 'grow' OR v_t.invoicing_provider <> 'grow'
     OR v_t.payment_provider_secret_enc IS DISTINCT FROM v_secret_before THEN
    RAISE EXCEPTION 'FAIL a refused switch changed the Grow studio: % / %', v_t.payment_provider, v_t.invoicing_provider;
  END IF;
  IF EXISTS (SELECT 1 FROM payment_method_tokens WHERE tenant_id = v.grow_studio AND revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a refused switch revoked saved Grow cards';
  END IF;

  -- The same provider's keys can still be saved, and other settings still change.
  PERFORM save_tenant_grow_credentials('user-2', 'page-2', 'new-api-key');
  UPDATE tenants SET offline_payment_instructions = 'Cash at reception' WHERE id = v.grow_studio;
  SELECT * INTO v_t FROM tenants WHERE id = v.grow_studio;
  IF v_t.payment_provider_public_key <> 'page-2' THEN
    RAISE EXCEPTION 'FAIL Grow keys could not be updated for a Grow studio';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_method_tokens WHERE tenant_id = v.grow_studio AND revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL re-saving Grow keys revoked Grow cards';
  END IF;

  -- ── 2. Pay at the studio (no documents) → online: allowed, both ways in ──
  PERFORM pg_temp.act_as(v.offline_admin);
  IF pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L WHERE id = %L', 'icount', v.offline_studio)) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'FAIL offline → icount (unfinished) was allowed';
  END IF;
  IF NOT pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L WHERE id = %L', 'tranzila', v.offline_studio)) THEN
    RAISE EXCEPTION 'FAIL offline → tranzila (unfinished) was allowed';
  END IF;
  IF NOT pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L, invoicing_provider = %L WHERE id = %L', 'grow', 'green_invoice', v.offline_studio)) THEN
    RAISE EXCEPTION 'FAIL offline → grow with another invoicing service was allowed';
  END IF;

  -- (a) Settings "How customers pay" first, then the provider's keys.
  UPDATE tenants SET payment_provider = 'grow' WHERE id = v.offline_studio;
  PERFORM save_tenant_grow_credentials('user-1', 'page-1', 'api-key-1');
  SELECT * INTO v_t FROM tenants WHERE id = v.offline_studio;
  IF v_t.payment_provider <> 'grow' OR v_t.invoicing_provider <> 'grow' THEN
    RAISE EXCEPTION 'FAIL offline → grow left %/%', v_t.payment_provider, v_t.invoicing_provider;
  END IF;
  -- Once online, going back is support's job.
  IF NOT pg_temp.blocked(format('UPDATE tenants SET payment_provider = %L WHERE id = %L', 'offline', v.offline_studio)) THEN
    RAISE EXCEPTION 'FAIL grow → offline was allowed after the move';
  END IF;

  -- (b) Keys saved straight from pay at the studio: YPay and Invoice4U.
  PERFORM pg_temp.no_claims();
  UPDATE tenants SET payment_provider = 'offline', invoicing_provider = 'none' WHERE id = v.offline_studio;
  PERFORM pg_temp.act_as(v.offline_admin);
  PERFORM save_tenant_ypay_credentials('client-1', 'secret-1');
  SELECT * INTO v_t FROM tenants WHERE id = v.offline_studio;
  IF v_t.payment_provider <> 'ypay' OR v_t.invoicing_provider <> 'ypay' THEN
    RAISE EXCEPTION 'FAIL offline → ypay left %/%', v_t.payment_provider, v_t.invoicing_provider;
  END IF;

  PERFORM pg_temp.no_claims();
  UPDATE tenants SET payment_provider = 'offline', invoicing_provider = 'none' WHERE id = v.offline_studio;
  PERFORM pg_temp.act_as(v.offline_admin);
  PERFORM save_tenant_invoice4u_credentials('api-key-2', '1');
  SELECT * INTO v_t FROM tenants WHERE id = v.offline_studio;
  IF v_t.payment_provider <> 'invoice4u' OR v_t.invoicing_provider <> 'invoice4u' THEN
    RAISE EXCEPTION 'FAIL offline → invoice4u left %/%', v_t.payment_provider, v_t.invoicing_provider;
  END IF;

  -- ── 3. Pay at the studio that already issues documents: blocked ──
  PERFORM pg_temp.act_as(v.docs_admin);
  IF NOT pg_temp.blocked($q$SELECT save_tenant_grow_credentials('u', 'p', 'k')$q$) THEN
    RAISE EXCEPTION 'FAIL offline with YPay documents → grow was allowed';
  END IF;

  -- ── 4. The service role, platform administrators and the SQL editor still can ──
  PERFORM pg_temp.act_as_service();
  UPDATE tenants SET payment_provider = 'ypay', invoicing_provider = 'ypay' WHERE id = v.grow_studio;
  PERFORM pg_temp.no_claims();
  UPDATE tenants SET payment_provider = 'grow', invoicing_provider = 'grow' WHERE id = v.grow_studio;

  PERFORM pg_temp.no_claims();
  RAISE NOTICE 'provider switch: all checks passed';
END;
$$;

-- Same rule as the Settings form path under RLS (not just as the table owner).
DO $$
DECLARE v ids%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ids;
  PERFORM pg_temp.act_as(v.grow_admin);
END;
$$;
SET ROLE authenticated;
DO $$
DECLARE v_grow uuid := (SELECT grow_studio FROM ids);
BEGIN
  BEGIN
    UPDATE tenants SET payment_provider = 'ypay' WHERE id = v_grow;
    RAISE EXCEPTION 'FAIL grow → ypay under RLS was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'payment_provider_switch_blocked' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
SELECT 'provider switch: all checks passed' AS result;
