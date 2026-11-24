-- Ask OpalSwift on for the owner's own studio, creativeballet (owner, 24 Nov 2026).
--
-- Feature 'platform:assistant.help' is opt_in (migration 20261124194500): only a
-- tenant override turns it on. This adds that override for one studio, by
-- subdomain. Run only once the release with #535 is live (the feature row must
-- exist; otherwise this raises and nothing changes). Re-running is harmless.
-- Expected: 1 row. Anything else raises and the whole file rolls back.
DO $$
DECLARE
  v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM feature_definitions WHERE key = 'platform:assistant.help') THEN
    RAISE EXCEPTION 'ask_opalswift_creativeballet: feature platform:assistant.help not in prod yet (release #535 first)';
  END IF;

  INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled, set_by, note)
  SELECT t.id, 'platform:assistant.help', true, 'operator', 'Ask OpalSwift: owner''s own studio (24 Nov 2026)'
  FROM tenants t
  WHERE t.subdomain = 'creativeballet'
  ON CONFLICT (tenant_id, feature_key)
  DO UPDATE SET is_enabled = true, set_by = 'operator', note = EXCLUDED.note, updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ask_opalswift_creativeballet: % rows, expected 1', v_rows;
  END IF;
  RAISE NOTICE 'ask_opalswift_creativeballet: switched on for 1 studio';
END $$;
