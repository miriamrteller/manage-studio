-- =============================================================================
-- tenant_config_by_subdomain — public tenant branding + Stripe publishable key
-- DEPENDS ON: 001 tenants (includes Stripe columns)
-- =============================================================================

CREATE OR REPLACE VIEW tenant_config_by_subdomain AS
SELECT
  id,
  name,
  subdomain AS tenant_subdomain,
  language_default,
  country,
  currency,
  vat_rate,
  primary_color,
  accent_color,
  stripe_publishable_key,
  (stripe_secret_key_enc IS NOT NULL) AS stripe_secret_configured,
  (stripe_webhook_secret_enc IS NOT NULL) AS stripe_webhook_configured,
  stripe_credentials_updated_at
FROM tenants;

GRANT SELECT ON tenant_config_by_subdomain TO anon, authenticated;
