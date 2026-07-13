-- =============================================================================
-- Migration: 20260709000150_fix_rapyd_access_key_index.sql
-- Purpose:   Replace GIN index on rapyd_config->>'access_key' with btree.
--            GIN is optimised for containment/full-text lookups; equality
--            lookups on a scalar text expression are more efficient with btree.
-- Rule:      Additive fix — drops the incorrect index, creates correct one.
--            No columns, tables, or data are modified.
-- =============================================================================

-- Drop the GIN index created in 20260709000100
DROP INDEX IF EXISTS idx_tenant_configs_rapyd_access_key;

-- Recreate as btree (O(log n) equality scan)
CREATE INDEX IF NOT EXISTS idx_tenant_configs_rapyd_access_key
  ON tenant_configs USING btree ((rapyd_config->>'access_key'));
