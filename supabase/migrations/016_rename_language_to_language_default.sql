-- Migration 016: Rename language column to language_default
-- Purpose: Clarify that this is the TENANT'S language default, not user preference
-- This aligns with architecture where tenant has a default, users can override it in future

ALTER TABLE tenants
RENAME COLUMN language TO language_default;

-- Verify the rename
SELECT id, name, language_default FROM tenants LIMIT 1;
