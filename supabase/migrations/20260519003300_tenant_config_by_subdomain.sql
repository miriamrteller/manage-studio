-- Migration 033: Create tenant_config_by_subdomain view for clean frontend/backend separation
-- Purpose: Frontend queries this view with simple `select=*` instead of explicit column list
-- Pattern matches Migration 032 (public_classes_by_subdomain)

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
  accent_color
FROM tenants;

GRANT SELECT ON tenant_config_by_subdomain TO anon, authenticated;