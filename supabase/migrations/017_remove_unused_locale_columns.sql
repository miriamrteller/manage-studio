-- Migration 017: Remove unused locale and dir columns if they exist
-- These should never have been stored; they are derived values computed at runtime
-- Keeping only language_default as source of truth

ALTER TABLE tenants
DROP COLUMN IF EXISTS dir;

ALTER TABLE tenants
DROP COLUMN IF EXISTS locale;

-- Verify cleanup
SELECT id, name, language_default FROM tenants LIMIT 1;
