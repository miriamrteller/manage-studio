-- =============================================================================
-- Gallery email signature (owner, 22 Nov 2026)
-- =============================================================================
-- The Send gallery email ends "Sincerely," and the name the studio signs with.
-- The studio types it once in the Send gallery box; it is kept here for next
-- time. NULL: the sending admin's own name, else the studio's name.
--
-- ADDITIVE. DEPENDENCIES: 20261104171055_photo_shop.sql
-- =============================================================================

ALTER TABLE tenant_photo_shop_settings
  ADD COLUMN IF NOT EXISTS email_signature TEXT
    CHECK (email_signature IS NULL OR char_length(email_signature) BETWEEN 1 AND 100);
COMMENT ON COLUMN tenant_photo_shop_settings.email_signature IS
  'Name the gallery email is signed with ("Sincerely, <name>"). NULL: the sending admin''s name, else the studio name.';
