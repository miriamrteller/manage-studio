-- Migration 032: Public Classes View
-- Creates a view for unauthenticated access to public classes
-- DEPENDENCIES: Migrations 001, 004 (tenants and classes tables)
-- REQUIRED BY: Frontend landing page (public class listings)

CREATE OR REPLACE VIEW public_classes_by_subdomain AS
SELECT 
  c.id,
  c.tenant_id,
  c.name,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.max_capacity,
  c.price_minor,
  c.currency,
  c.vat_rate,
  c.is_public,
  c.status,
  c.term_id,
  c.level_id,
  t.subdomain as tenant_subdomain
FROM classes c
JOIN tenants t ON c.tenant_id = t.id
WHERE c.is_public = true;

-- Grant public access to the view (no auth required)
GRANT SELECT ON public_classes_by_subdomain TO anon;
GRANT SELECT ON public_classes_by_subdomain TO authenticated;
