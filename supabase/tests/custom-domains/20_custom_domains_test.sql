-- Self-serve custom domains (data model). Fixture from client-portal: tenants
-- T1 = a0..01 (photo), T2 = a0..02 (dance). admin1 = T1 tenant_admin, admin2 =
-- T2 tenant_admin, alice = T1 account holder (not an admin).
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
 ('b0000000-0000-4000-8000-0000000000d1','admin1@x.test'),
 ('b0000000-0000-4000-8000-0000000000d2','admin2@x.test');
INSERT INTO user_profiles (id, tenant_id, role, email) VALUES
 ('b0000000-0000-4000-8000-0000000000d1','a0000000-0000-4000-8000-000000000001','{tenant_admin}','admin1@x.test'),
 ('b0000000-0000-4000-8000-0000000000d2','a0000000-0000-4000-8000-000000000002','{tenant_admin}','admin2@x.test');
SET session_replication_role = origin;

CREATE FUNCTION pg_temp.as_user(uid UUID) RETURNS VOID LANGUAGE sql AS
$$ SELECT set_config('request.jwt.claim.sub', uid::text, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;

-- Rows written as the service role would (superuser here, RLS does not apply).
INSERT INTO tenant_custom_domains (id, tenant_id, hostname, status, auto_check_until, delete_after, requested_by)
VALUES ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'app.photo-studio.com', 'pending', now() + interval '24 hours', now() + interval '30 days',
        'b0000000-0000-4000-8000-0000000000d1');

DO $$
DECLARE n INT;
BEGIN
  -- Shape rules
  BEGIN
    INSERT INTO tenant_custom_domains (tenant_id, hostname) VALUES ('a0000000-0000-4000-8000-000000000002', 'App.Bad.com');
    RAISE EXCEPTION 'FAIL upper-case hostname accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO tenant_custom_domains (tenant_id, hostname, status) VALUES ('a0000000-0000-4000-8000-000000000002', 'app.x.com', 'removed');
    RAISE EXCEPTION 'FAIL removed without removed_at accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- One live hostname across studios, one live domain per studio
  BEGIN
    INSERT INTO tenant_custom_domains (tenant_id, hostname) VALUES ('a0000000-0000-4000-8000-000000000002', 'app.photo-studio.com');
    RAISE EXCEPTION 'FAIL second studio took a live hostname';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO tenant_custom_domains (tenant_id, hostname) VALUES ('a0000000-0000-4000-8000-000000000001', 'app.second.com');
    RAISE EXCEPTION 'FAIL a studio got two live domains';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- Audit trail on insert
  SELECT count(*) INTO n FROM audit_log WHERE entity_id = 'aa000000-0000-4000-8000-000000000001' AND action = 'custom_domain.pending';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL insert not audited (%)', n; END IF;
  RAISE NOTICE 'ok  shape, uniqueness and audit on insert';
END $$;

-- RLS: admin1 sees T1's row, admin2 and a non-admin see nothing, nobody writes.
SET ROLE authenticated;
SELECT pg_temp.as_user('b0000000-0000-4000-8000-0000000000d1');
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_custom_domains) <> 1 THEN RAISE EXCEPTION 'FAIL admin1 cannot read own domain'; END IF;
  BEGIN
    UPDATE tenant_custom_domains SET status = 'active';
    RAISE EXCEPTION 'FAIL authenticated could update';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO tenant_custom_domains (tenant_id, hostname) VALUES ('a0000000-0000-4000-8000-000000000001', 'app.sneaky.com');
    RAISE EXCEPTION 'FAIL authenticated could insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO custom_domain_rollout (tenant_id) VALUES ('a0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL a studio admin enabled its own rollout';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF custom_domain_enabled('a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FAIL enabled before rollout'; END IF;
  RAISE NOTICE 'ok  admin reads own row only, cannot write, cannot self-enable';
END $$;
SELECT pg_temp.as_user('b0000000-0000-4000-8000-0000000000d2');
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_custom_domains) <> 0 THEN RAISE EXCEPTION 'FAIL admin2 sees another studio''s domain'; END IF;
END $$;
SELECT pg_temp.as_user('b0000000-0000-4000-8000-00000000000a');
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_custom_domains) <> 0 THEN RAISE EXCEPTION 'FAIL a non-admin sees the studio domain'; END IF;
  RAISE NOTICE 'ok  other studios and non-admins see nothing';
END $$;
RESET ROLE;

-- Rollout switch: only for the studio's own admins.
INSERT INTO custom_domain_rollout (tenant_id) VALUES ('a0000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT pg_temp.as_user('b0000000-0000-4000-8000-0000000000d1');
DO $$ BEGIN
  IF NOT custom_domain_enabled('a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FAIL rollout not seen by own admin'; END IF;
END $$;
SELECT pg_temp.as_user('b0000000-0000-4000-8000-0000000000d2');
DO $$ BEGIN
  IF custom_domain_enabled('a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FAIL another studio''s admin can probe the rollout'; END IF;
  RAISE NOTICE 'ok  rollout switch';
END $$;
RESET ROLE;

-- Handoff check: true only for an ACTIVE studio domain (tenants.custom_domain).
DO $$ BEGIN
  IF is_active_custom_domain('app.photo-studio.com') THEN RAISE EXCEPTION 'FAIL pending domain counted as active'; END IF;
  UPDATE tenants SET custom_domain = 'app.photo-studio.com' WHERE id = 'a0000000-0000-4000-8000-000000000001';
  UPDATE tenant_custom_domains SET status = 'active', activated_at = now() WHERE id = 'aa000000-0000-4000-8000-000000000001';
  IF NOT is_active_custom_domain('APP.photo-studio.com') THEN RAISE EXCEPTION 'FAIL active domain not recognised'; END IF;
  IF is_active_custom_domain('evil.example.com') OR is_active_custom_domain(NULL) THEN RAISE EXCEPTION 'FAIL unknown host accepted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE entity_id = 'aa000000-0000-4000-8000-000000000001' AND action = 'custom_domain.active'
                 AND before_state ->> 'status' = 'pending') THEN
    RAISE EXCEPTION 'FAIL status change not audited';
  END IF;
  RAISE NOTICE 'ok  handoff check and status audit';
END $$;

-- 30-day lock: after T1 removes it, T2 cannot claim it; T1 can.
DO $$ BEGIN
  UPDATE tenants SET custom_domain = NULL WHERE id = 'a0000000-0000-4000-8000-000000000001';
  UPDATE tenant_custom_domains SET status = 'removed', removed_at = now() WHERE id = 'aa000000-0000-4000-8000-000000000001';
  IF custom_domain_hostname_available('a0000000-0000-4000-8000-000000000002', 'app.photo-studio.com') THEN
    RAISE EXCEPTION 'FAIL another studio can claim a hostname released today';
  END IF;
  IF NOT custom_domain_hostname_available('a0000000-0000-4000-8000-000000000001', 'app.photo-studio.com') THEN
    RAISE EXCEPTION 'FAIL the same studio cannot reclaim its own hostname';
  END IF;
  UPDATE tenant_custom_domains SET removed_at = now() - interval '31 days' WHERE id = 'aa000000-0000-4000-8000-000000000001';
  IF NOT custom_domain_hostname_available('a0000000-0000-4000-8000-000000000002', 'app.photo-studio.com') THEN
    RAISE EXCEPTION 'FAIL hostname still locked after 30 days';
  END IF;
  -- A removed row frees the per-studio slot.
  INSERT INTO tenant_custom_domains (tenant_id, hostname) VALUES ('a0000000-0000-4000-8000-000000000001', 'app.next.com');
  RAISE NOTICE 'ok  30-day hostname lock';
END $$;

DO $$ BEGIN
  IF has_function_privilege('anon', 'custom_domain_enabled(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'custom_domain_hostname_available(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tenant_custom_domains_touch_and_audit()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL a client role can execute a restricted function';
  END IF;
  IF NOT has_function_privilege('anon', 'is_active_custom_domain(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL the handoff check must be callable before sign-in';
  END IF;
  RAISE NOTICE 'ok  function grants';
END $$;

-- Poller (6/8): one job, every 10 minutes, and it calls the function only when
-- some row needs it (a quiet run is just the SQL check).
CREATE FUNCTION pg_temp.poll_calls() RETURNS INT LANGUAGE plpgsql AS $$
DECLARE cmd TEXT; n INT;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE command ILIKE '%/functions/v1/custom-domain%';
  EXECUTE 'SELECT count(*) FROM (' || regexp_replace(cmd, ';[[:space:]]*$', '') || ') calls' INTO n;
  RETURN n;
END $$;
DO $$
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE command ILIKE '%/functions/v1/custom-domain%') <> 1 THEN
    RAISE EXCEPTION 'FAIL poller not scheduled exactly once';
  END IF;
  IF (SELECT schedule FROM cron.job WHERE command ILIKE '%/functions/v1/custom-domain%') <> '*/10 * * * *' THEN
    RAISE EXCEPTION 'FAIL poller schedule';
  END IF;
  -- app.next.com (T1) is pending from the lock test above.
  IF pg_temp.poll_calls() <> 1 THEN RAISE EXCEPTION 'FAIL pending row did not trigger a call'; END IF;
  UPDATE tenant_custom_domains SET status = 'paused' WHERE hostname = 'app.next.com';
  IF pg_temp.poll_calls() <> 0 THEN RAISE EXCEPTION 'FAIL a paused row inside its 30 days triggered a call'; END IF;
  UPDATE tenant_custom_domains SET delete_after = now() - interval '1 minute' WHERE hostname = 'app.next.com';
  IF pg_temp.poll_calls() <> 1 THEN RAISE EXCEPTION 'FAIL a row due for deletion did not trigger a call'; END IF;
  UPDATE tenant_custom_domains SET status = 'active', delete_after = NULL, activated_at = now() WHERE hostname = 'app.next.com';
  IF pg_temp.poll_calls() <> 0 THEN RAISE EXCEPTION 'FAIL an active-only table triggered a call'; END IF;
  RAISE NOTICE 'ok  poller: one job, calls only when needed';
END $$;
