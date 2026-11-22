-- =============================================================================
-- 20261122190641: Studio shop (beta), public page. Anyone visiting the studio's
-- site can see what the studio sells (owner, 22 Nov 2026), without signing in.
--
--   * get_public_shop_catalogue(p_tenant_id): the studio's shown items, with
--     their sizes and whether each size is in stock. Empty when the studio does
--     not have the shop. Stock numbers are not shown, only in stock or sold out.
--
-- Buying still goes through place_shop_order (signed-in families) for now.
--
-- ADDITIVE MIGRATION: one new read-only function.
-- DEPENDENCIES: 20261111150000 (private.studio_shop_enabled).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_shop_catalogue(p_tenant_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'description', p.description,
           'price_minor', p.price_minor, 'currency', p.currency, 'image_path', p.image_path,
           'variants', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                 'id', v.id, 'label', v.label,
                                 'in_stock', v.stock IS NULL OR v.stock > 0)
                               ORDER BY v.position), '[]'::jsonb)
                          FROM shop_product_variants v WHERE v.product_id = p.id))
           ORDER BY p.position, p.created_at), '[]'::jsonb)
    FROM shop_products p
   WHERE p_tenant_id IS NOT NULL
     AND p.tenant_id = p_tenant_id
     AND p.active
     AND private.studio_shop_enabled(p.tenant_id);
$$;
COMMENT ON FUNCTION get_public_shop_catalogue(UUID) IS
  'Studio shop (beta): the items a studio shows on its public Shop page. In stock or sold out per size, no stock counts.';
REVOKE ALL ON FUNCTION get_public_shop_catalogue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_shop_catalogue(UUID) TO anon, authenticated;
