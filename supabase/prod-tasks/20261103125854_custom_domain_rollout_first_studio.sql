-- Self-serve custom domains: turn the feature on for the first test studio.
--
-- Before running: replace REPLACE_WITH_STUDIO_SUBDOMAIN below with the studio's
-- subdomain (the part before .opalswift.com) in a small PR. Run only after the
-- release that ships the custom-domain screen and the owner's Cloudflare setup
-- (docs/deployment/CUSTOM-DOMAIN.md, "Self-serve custom domains: owner setup").
--
-- Expected: INSERT 1 (INSERT 0 if that studio is already in the rollout).
-- Stops with an error, and changes nothing, while the placeholder is still here
-- or the subdomain does not exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'REPLACE_WITH_STUDIO_SUBDOMAIN') THEN
    RAISE EXCEPTION 'Name the test studio first: replace REPLACE_WITH_STUDIO_SUBDOMAIN with a real subdomain';
  END IF;
END $$;

INSERT INTO custom_domain_rollout (tenant_id, note)
SELECT id, 'first self-serve test'
FROM tenants
WHERE subdomain = 'REPLACE_WITH_STUDIO_SUBDOMAIN'
ON CONFLICT (tenant_id) DO NOTHING;
