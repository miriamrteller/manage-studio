-- =============================================================================
-- get_public_classes_by_subdomain — public class catalog for landing pages
-- DEPENDS ON: 001 tenants, 004 classes (terms, levels, classes)
-- ACCESS: anon + authenticated via RPC; no direct table access for anon
-- =============================================================================

-- Replace previous unfiltered view with a subdomain-filtered SECURITY DEFINER RPC.
-- Only returns active, public classes for the requested subdomain.
-- Safe for unauthenticated (anon) callers on landing pages.

CREATE OR REPLACE FUNCTION get_public_classes_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id              UUID,
  tenant_id       UUID,
  tenant_subdomain TEXT,
  name            TEXT,
  day_of_week     INT,
  start_time      TIME,
  end_time        TIME,
  max_capacity    INT,
  price_minor     INT,
  currency        TEXT,

  term_id         UUID,
  level_id        UUID,
  status          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.tenant_id,
    t.subdomain,
    c.name,
    c.day_of_week,
    c.start_time,
    c.end_time,
    c.max_capacity,
    c.price_minor,
    c.currency,

    c.term_id,
    c.level_id,
    c.status
  FROM classes c
  JOIN tenants t ON c.tenant_id = t.id
  WHERE t.subdomain = trim(p_subdomain)
    AND c.is_public = true
    AND c.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_classes_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_classes_by_subdomain(TEXT) TO authenticated;
